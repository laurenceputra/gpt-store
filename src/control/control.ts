import { bearerToken, buildApiKeySecret, hasRole, jsonError } from "../auth/auth";
import {
  acquireBootstrapGuard,
  completeBootstrapGuard,
  countOperatorKeys,
  createApiKeyRecord,
  createJob,
  createTenant,
  ensureBootstrapStateRow,
  getApiKeyById,
  getJobById,
  getTenantById,
  isValidApiKeyRole,
  isValidJobType,
  listApiKeys,
  releaseBootstrapGuard,
  revokeApiKey
} from "../db/d1";
import { enqueueJob } from "../jobs/jobs";
import type { ApiKeyRecord, ApiKeyRole, AuthContext, Env, JobType } from "../types";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

class PublicError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

async function readJson(req: Request): Promise<any> {
  if (!req.body) return {};
  try {
    return await req.json();
  } catch {
    throw new PublicError(400, "invalid_json_body");
  }
}

function publicKey(key: ApiKeyRecord) {
  const { secret_hash: _secretHash, ...safe } = key;
  return safe;
}

function validateSlug(slug: string): void {
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug)) throw new PublicError(400, "invalid_tenant_slug");
}

function parseExpiresAt(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  if (!raw) throw new PublicError(400, "invalid_expires_at");
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw new PublicError(400, "invalid_expires_at");
  if (parsed <= Date.now()) throw new PublicError(400, "invalid_expires_at");
  return new Date(parsed).toISOString();
}

function toControlError(err: unknown): Response {
  if (err instanceof PublicError) return jsonError(err.status, err.message);
  if (err instanceof Error && /^[a-z0-9_]+$/.test(err.message)) return jsonError(400, err.message);
  return jsonError(500, "internal_error");
}

async function createKeyWithSecret(
  env: Env,
  input: { tenant_id: string | null; role: ApiKeyRole; label: string; expires_at?: string | null; created_by_key_id?: string | null }
) {
  const material = await buildApiKeySecret(env);
  const key = await createApiKeyRecord(env, {
    tenant_id: input.tenant_id,
    role: input.role,
    label: input.label,
    prefix: material.prefix,
    secret_hash: material.secret_hash,
    expires_at: input.expires_at ?? null,
    created_by_key_id: input.created_by_key_id ?? null
  });
  return { key, token: material.token };
}

export async function handleBootstrap(req: Request, env: Env): Promise<Response> {
  let guardAcquired = false;
  try {
    if (req.method !== "POST") return jsonError(405, "method_not_allowed");
    if (!env.BOOTSTRAP_TOKEN || bearerToken(req) !== env.BOOTSTRAP_TOKEN) return jsonError(401, "unauthorized");
    if ((await countOperatorKeys(env)) > 0) return jsonError(409, "bootstrap_already_completed");
    await ensureBootstrapStateRow(env);
    guardAcquired = await acquireBootstrapGuard(env);
    if (!guardAcquired) return jsonError(409, "bootstrap_already_completed");
    if ((await countOperatorKeys(env)) > 0) {
      await completeBootstrapGuard(env, null);
      return jsonError(409, "bootstrap_already_completed");
    }
    const body = await readJson(req);
    const label = String(body?.label ?? "Initial operator").trim();
    if (!label) return jsonError(400, "label_required");
    const created = await createKeyWithSecret(env, { tenant_id: null, role: "operator", label });
    await completeBootstrapGuard(env, created.key.id);
    return json({ key: publicKey(created.key), token: created.token }, 201);
  } catch (err) {
    if (guardAcquired) await releaseBootstrapGuard(env).catch(() => undefined);
    return toControlError(err);
  }
}

async function createPlatformTenant(req: Request, env: Env, auth: AuthContext): Promise<Response> {
  if (!hasRole(auth, ["operator"])) return jsonError(403, "forbidden");
  const body = await readJson(req);
  const slug = String(body?.slug ?? "").trim();
  const name = String(body?.name ?? "").trim();
  if (!slug || !name) return jsonError(400, "slug_and_name_required");
  validateSlug(slug);
  const tenant = await createTenant(env, { slug, name });
  const initialLabel = body?.initial_admin_key_label === undefined ? null : String(body.initial_admin_key_label).trim();
  if (!initialLabel) return json({ tenant }, 201);
  const created = await createKeyWithSecret(env, {
    tenant_id: tenant.id,
    role: "tenant_admin",
    label: initialLabel,
    created_by_key_id: auth.apiKeyId
  });
  return json({ tenant, initial_admin_key: publicKey(created.key), token: created.token }, 201);
}

async function me(env: Env, auth: AuthContext): Promise<Response> {
  return json({ auth, tenant: auth.tenantId ? await getTenantById(env, auth.tenantId) : null });
}

async function listVisibleKeys(req: Request, env: Env, auth: AuthContext): Promise<Response> {
  if (!hasRole(auth, ["operator", "tenant_admin"])) return jsonError(403, "forbidden");
  const url = new URL(req.url);
  const tenantId = auth.role === "operator" ? url.searchParams.get("tenant_id") : auth.tenantId;
  if (auth.role !== "operator" && !tenantId) return jsonError(403, "forbidden");
  const keys = await listApiKeys(env, tenantId ?? null);
  return json({ keys: keys.map(publicKey) });
}

function allowedChildRole(auth: AuthContext, role: ApiKeyRole): boolean {
  if (auth.role === "operator") return true;
  return auth.role === "tenant_admin" && ["tenant_reader", "tenant_writer", "tenant_admin"].includes(role);
}

async function createVisibleKey(req: Request, env: Env, auth: AuthContext): Promise<Response> {
  if (!hasRole(auth, ["operator", "tenant_admin"])) return jsonError(403, "forbidden");
  const body = await readJson(req);
  const role = String(body?.role ?? "") as ApiKeyRole;
  const label = String(body?.label ?? "").trim();
  const expiresAt = parseExpiresAt(body?.expires_at);
  if (!label) return jsonError(400, "label_required");
  if (!isValidApiKeyRole(role) || !allowedChildRole(auth, role)) return jsonError(400, "invalid_role");

  let tenantId: string | null;
  if (role === "operator") {
    if (auth.role !== "operator") return jsonError(403, "forbidden");
    tenantId = null;
  } else if (auth.role === "operator") {
    tenantId = String(body?.tenant_id ?? "").trim();
    if (!tenantId) return jsonError(400, "tenant_id_required");
    if (!(await getTenantById(env, tenantId))) return jsonError(404, "tenant_not_found");
  } else {
    tenantId = auth.tenantId;
    if (!tenantId) return jsonError(403, "forbidden");
  }

  const created = await createKeyWithSecret(env, { tenant_id: tenantId, role, label, expires_at: expiresAt, created_by_key_id: auth.apiKeyId });
  return json({ key: publicKey(created.key), token: created.token }, 201);
}

async function revokeVisibleKey(env: Env, auth: AuthContext, keyId: string): Promise<Response> {
  if (!hasRole(auth, ["operator", "tenant_admin"])) return jsonError(403, "forbidden");
  const key = await getApiKeyById(env, keyId);
  if (!key) return jsonError(404, "key_not_found");
  if (auth.role !== "operator" && key.tenant_id !== auth.tenantId) return jsonError(404, "key_not_found");
  await revokeApiKey(env, key.id);
  return json({ revoked: true, id: key.id });
}

function tenantForJob(auth: AuthContext, body: any): string | Response {
  if (auth.role === "operator") {
    const tenantId = String(body?.tenant_id ?? "").trim();
    return tenantId || jsonError(400, "tenant_id_required");
  }
  if (auth.role !== "tenant_admin" || !auth.tenantId) return jsonError(403, "forbidden");
  return auth.tenantId;
}

async function createTenantJob(req: Request, env: Env, auth: AuthContext, type: JobType): Promise<Response> {
  if (!isValidJobType(type)) return jsonError(400, "invalid_job_type");
  const body = await readJson(req);
  const tenantIdOrResponse = tenantForJob(auth, body);
  if (tenantIdOrResponse instanceof Response) return tenantIdOrResponse;
  const tenantId = tenantIdOrResponse;
  if (!(await getTenantById(env, tenantId))) return jsonError(404, "tenant_not_found");
  const job = await createJob(env, { tenant_id: tenantId, type, requested_by_key_id: auth.apiKeyId });
  await enqueueJob(env, tenantId, job.id);
  return json({ job }, 202);
}

async function getVisibleJob(env: Env, auth: AuthContext, jobId: string): Promise<Response> {
  if (!hasRole(auth, ["operator", "tenant_admin"])) return jsonError(403, "forbidden");
  const job = await getJobById(env, jobId);
  if (!job) return jsonError(404, "job_not_found");
  if (auth.role !== "operator" && job.tenant_id !== auth.tenantId) return jsonError(404, "job_not_found");
  return json({ job });
}

export async function handleControlRequest(req: Request, env: Env, auth: AuthContext): Promise<Response> {
  try {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/v1/me" && req.method === "GET") return await me(env, auth);
    if (path === "/v1/platform/tenants" && req.method === "POST") return await createPlatformTenant(req, env, auth);
    if (path === "/v1/keys" && req.method === "GET") return await listVisibleKeys(req, env, auth);
    if (path === "/v1/keys" && req.method === "POST") return await createVisibleKey(req, env, auth);

    const revokeMatch = path.match(/^\/v1\/keys\/([^/]+)\/revoke$/);
    if (revokeMatch && req.method === "POST") return await revokeVisibleKey(env, auth, decodeURIComponent(revokeMatch[1]));

    if (path === "/v1/jobs/export" && req.method === "POST") return await createTenantJob(req, env, auth, "export");
    if (path === "/v1/jobs/reindex" && req.method === "POST") return await createTenantJob(req, env, auth, "reindex");

    const jobMatch = path.match(/^\/v1\/jobs\/([^/]+)$/);
    if (jobMatch && req.method === "GET") return await getVisibleJob(env, auth, decodeURIComponent(jobMatch[1]));

    return jsonError(404, "not_found");
  } catch (err) {
    return toControlError(err);
  }
}
