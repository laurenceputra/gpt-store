import {
  API_KEY_ROLES,
  API_KEY_STATUSES,
  JOB_STATUSES,
  JOB_TYPES,
  MEMORY_STATUSES,
  MEMORY_TYPES,
  TENANT_STATUSES,
  type ApiKeyRecord,
  type ApiKeyRole,
  type ApiKeyStatus,
  type AuthContext,
  type JobRecord,
  type JobStatus,
  type JobType,
  type MemoryRecord,
  type MemoryStatus,
  type MemoryType,
  type TenantRecord,
  type TenantStatus
} from "../types";

export function isValidMemoryType(value: string): value is MemoryType {
  return MEMORY_TYPES.includes(value as MemoryType);
}

export function isValidStatus(value: string): value is MemoryStatus {
  return MEMORY_STATUSES.includes(value as MemoryStatus);
}

export function isValidApiKeyRole(value: string): value is ApiKeyRole {
  return API_KEY_ROLES.includes(value as ApiKeyRole);
}

export function isValidApiKeyStatus(value: string): value is ApiKeyStatus {
  return API_KEY_STATUSES.includes(value as ApiKeyStatus);
}

export function isValidTenantStatus(value: string): value is TenantStatus {
  return TENANT_STATUSES.includes(value as TenantStatus);
}

export function isValidJobType(value: string): value is JobType {
  return JOB_TYPES.includes(value as JobType);
}

export function isValidJobStatus(value: string): value is JobStatus {
  return JOB_STATUSES.includes(value as JobStatus);
}

export function createId(): string {
  return crypto.randomUUID();
}

export async function countOperatorKeys(env: { DB: D1Database }): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM api_keys WHERE role = 'operator'").first<{ count: number }>();
  return Number(row?.count ?? 0);
}

export async function ensureBootstrapStateRow(env: { DB: D1Database }): Promise<void> {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS bootstrap_state (id INTEGER PRIMARY KEY CHECK (id = 1), status TEXT NOT NULL DEFAULT 'pending', completed_at TEXT, key_id TEXT, lease_expires_at TEXT, FOREIGN KEY(key_id) REFERENCES api_keys(id) ON DELETE SET NULL)"
  ).run();
  const columns = await env.DB.prepare("PRAGMA table_info(bootstrap_state)").all<{ name: string }>();
  const columnNames = new Set((columns.results ?? []).map((c) => c.name));
  if (!columnNames.has("lease_expires_at")) {
    await env.DB.prepare("ALTER TABLE bootstrap_state ADD COLUMN lease_expires_at TEXT").run();
  }
  await env.DB.prepare("INSERT OR IGNORE INTO bootstrap_state(id, status, completed_at, key_id, lease_expires_at) VALUES (1, 'pending', NULL, NULL, NULL)").run();
}

export async function acquireBootstrapGuard(env: { DB: D1Database }): Promise<boolean> {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + 2 * 60 * 1000).toISOString();
  const nowIso = now.toISOString();
  const result = await env.DB.prepare(
    "UPDATE bootstrap_state SET status = 'in_progress', lease_expires_at = ? WHERE id = 1 AND (status = 'pending' OR (status = 'in_progress' AND lease_expires_at IS NOT NULL AND lease_expires_at < ?))"
  )
    .bind(leaseExpiresAt, nowIso)
    .run();
  return Number(result.meta?.changes ?? 0) > 0;
}

export async function completeBootstrapGuard(env: { DB: D1Database }, keyId: string | null): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE bootstrap_state SET status = 'completed', completed_at = ?, key_id = ?, lease_expires_at = NULL WHERE id = 1").bind(now, keyId).run();
}

export async function releaseBootstrapGuard(env: { DB: D1Database }): Promise<void> {
  await env.DB.prepare("UPDATE bootstrap_state SET status = 'pending', lease_expires_at = NULL WHERE id = 1 AND status = 'in_progress'").run();
}

export async function getApiKeyByPrefix(env: { DB: D1Database }, prefix: string): Promise<ApiKeyRecord | null> {
  return (await env.DB.prepare("SELECT * FROM api_keys WHERE prefix = ?").bind(prefix).first<ApiKeyRecord>()) ?? null;
}

export async function markApiKeyUsed(env: { DB: D1Database }, id: string, usedAt: string): Promise<void> {
  await env.DB.prepare("UPDATE api_keys SET last_used_at = ?, updated_at = ? WHERE id = ?").bind(usedAt, usedAt, id).run();
}

export async function createTenant(env: { DB: D1Database }, input: { slug: string; name: string; status?: TenantStatus }): Promise<TenantRecord> {
  const now = new Date().toISOString();
  const tenant: TenantRecord = {
    id: createId(),
    slug: input.slug,
    name: input.name,
    status: input.status ?? "active",
    created_at: now,
    updated_at: now
  };
  await env.DB.prepare("INSERT INTO tenants (id, slug, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(tenant.id, tenant.slug, tenant.name, tenant.status, tenant.created_at, tenant.updated_at)
    .run();
  return tenant;
}

export async function getTenantById(env: { DB: D1Database }, id: string): Promise<TenantRecord | null> {
  return (await env.DB.prepare("SELECT * FROM tenants WHERE id = ?").bind(id).first<TenantRecord>()) ?? null;
}

export async function createApiKeyRecord(
  env: { DB: D1Database },
  input: {
    tenant_id: string | null;
    role: ApiKeyRole;
    label: string;
    prefix: string;
    secret_hash: string;
    expires_at?: string | null;
    created_by_key_id?: string | null;
  }
): Promise<ApiKeyRecord> {
  const now = new Date().toISOString();
  const key: ApiKeyRecord = {
    id: createId(),
    tenant_id: input.tenant_id,
    role: input.role,
    label: input.label,
    prefix: input.prefix,
    secret_hash: input.secret_hash,
    status: "active",
    expires_at: input.expires_at ?? null,
    last_used_at: null,
    created_by_key_id: input.created_by_key_id ?? null,
    created_at: now,
    updated_at: now
  };
  await env.DB.prepare(
    "INSERT INTO api_keys (id, tenant_id, role, label, prefix, secret_hash, status, expires_at, last_used_at, created_by_key_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(
      key.id,
      key.tenant_id,
      key.role,
      key.label,
      key.prefix,
      key.secret_hash,
      key.status,
      key.expires_at,
      key.last_used_at,
      key.created_by_key_id,
      key.created_at,
      key.updated_at
    )
    .run();
  return key;
}

export async function listApiKeys(env: { DB: D1Database }, tenantId: string | null): Promise<ApiKeyRecord[]> {
  const rows = tenantId === null
    ? await env.DB.prepare("SELECT * FROM api_keys ORDER BY created_at DESC").all<ApiKeyRecord>()
    : await env.DB.prepare("SELECT * FROM api_keys WHERE tenant_id = ? ORDER BY created_at DESC").bind(tenantId).all<ApiKeyRecord>();
  return rows.results ?? [];
}

export async function getApiKeyById(env: { DB: D1Database }, id: string): Promise<ApiKeyRecord | null> {
  return (await env.DB.prepare("SELECT * FROM api_keys WHERE id = ?").bind(id).first<ApiKeyRecord>()) ?? null;
}

export async function revokeApiKey(env: { DB: D1Database }, id: string): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE api_keys SET status = 'revoked', updated_at = ? WHERE id = ?").bind(now, id).run();
}

export async function createMemory(
  env: { DB: D1Database },
  tenantId: string,
  input: Omit<MemoryRecord, "tenant_id" | "created_at" | "updated_at" | "tags">
): Promise<MemoryRecord> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO memories (id, tenant_id, namespace, project_key, memory_type, title, body, status, source, raw_object_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(
      input.id,
      tenantId,
      input.namespace,
      input.project_key,
      input.memory_type,
      input.title,
      input.body,
      input.status,
      input.source,
      input.raw_object_key ?? null,
      now,
      now
    )
    .run();
  return { ...input, tenant_id: tenantId, created_at: now, updated_at: now };
}

export async function getMemoryById(env: { DB: D1Database }, tenantId: string, id: string): Promise<MemoryRecord | null> {
  const result = await env.DB.prepare("SELECT * FROM memories WHERE tenant_id = ? AND id = ?").bind(tenantId, id).first<MemoryRecord>();
  if (!result) return null;
  const tags = await getTags(env, tenantId, id);
  return { ...result, tags };
}

export async function replaceTags(env: { DB: D1Database }, tenantId: string, memoryId: string, tags: string[]): Promise<void> {
  await env.DB.prepare("DELETE FROM memory_tags WHERE tenant_id = ? AND memory_id = ?").bind(tenantId, memoryId).run();
  for (const tag of tags) {
    await env.DB.prepare("INSERT OR IGNORE INTO memory_tags(tenant_id, memory_id, tag) VALUES (?, ?, ?)").bind(tenantId, memoryId, tag).run();
  }
}

export async function getTags(env: { DB: D1Database }, tenantId: string, memoryId: string): Promise<string[]> {
  const rows = await env.DB.prepare("SELECT tag FROM memory_tags WHERE tenant_id = ? AND memory_id = ? ORDER BY tag ASC").bind(tenantId, memoryId).all<{ tag: string }>();
  return (rows.results ?? []).map((r) => r.tag);
}

export async function saveVersion(
  env: { DB: D1Database },
  tenantId: string,
  memoryId: string,
  previousBody: string,
  newBody: string,
  changeReason: string,
  changedBy?: string | null
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO memory_versions(id, tenant_id, memory_id, previous_body, new_body, changed_by, change_reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(createId(), tenantId, memoryId, previousBody, newBody, changedBy ?? null, changeReason, new Date().toISOString())
    .run();
}

export async function updateMemory(
  env: { DB: D1Database },
  tenantId: string,
  id: string,
  input: { title: string; body: string; status: MemoryStatus; source: string | null; memory_type?: MemoryType }
): Promise<void> {
  await env.DB.prepare(
    "UPDATE memories SET title = ?, body = ?, status = ?, source = ?, memory_type = COALESCE(?, memory_type), updated_at = ? WHERE tenant_id = ? AND id = ?"
  )
    .bind(input.title, input.body, input.status, input.source, input.memory_type ?? null, new Date().toISOString(), tenantId, id)
    .run();
}

export async function insertAuditLog(env: { DB: D1Database }, auth: AuthContext, action: string, memoryId: string | null, detail: unknown): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO audit_log(id, tenant_id, api_key_id, actor_role, action, memory_id, tool_name, request_summary, actor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(
      createId(),
      auth.tenantId,
      auth.apiKeyId,
      auth.role,
      action,
      memoryId,
      action,
      JSON.stringify(detail ?? {}),
      auth.keyLabel,
      new Date().toISOString()
    )
    .run();
}

export async function listRecent(
  env: { DB: D1Database },
  tenantId: string,
  limit: number,
  filters?: { namespace?: string; project_key?: string | null; memory_type?: MemoryType }
): Promise<MemoryRecord[]> {
  const rows = await env.DB.prepare(
    "SELECT * FROM memories WHERE tenant_id = ? AND status = 'active' AND (? IS NULL OR namespace = ?) AND (? IS NULL OR project_key = ?) AND (? IS NULL OR memory_type = ?) ORDER BY updated_at DESC LIMIT ?"
  )
    .bind(
      tenantId,
      filters?.namespace ?? null,
      filters?.namespace ?? null,
      filters?.project_key ?? null,
      filters?.project_key ?? null,
      filters?.memory_type ?? null,
      filters?.memory_type ?? null,
      limit
    )
    .all<MemoryRecord>();
  return rows.results ?? [];
}

export async function searchKeyword(
  env: { DB: D1Database },
  tenantId: string,
  query: string,
  includeArchived: boolean,
  limit: number,
  filters?: { namespace?: string; project_key?: string | null; memory_type?: MemoryType; tags?: string[] }
): Promise<MemoryRecord[]> {
  const q = `%${query}%`;
  const tagFilter = Array.isArray(filters?.tags) ? filters.tags.map((t) => String(t).trim()).filter(Boolean) : [];
  const sql =
    "SELECT m.* FROM memories m " +
    (tagFilter.length ? "INNER JOIN memory_tags t ON t.tenant_id = m.tenant_id AND t.memory_id = m.id " : "") +
    "WHERE m.tenant_id = ? AND (m.title LIKE ? OR m.body LIKE ? OR m.project_key LIKE ?) " +
    "AND (? OR m.status != 'archived') " +
    "AND (? IS NULL OR m.namespace = ?) " +
    "AND (? IS NULL OR m.project_key = ?) " +
    "AND (? IS NULL OR m.memory_type = ?) " +
    (tagFilter.length ? `AND t.tag IN (${tagFilter.map(() => "?").join(",")}) ` : "") +
    (tagFilter.length ? "GROUP BY m.id HAVING COUNT(DISTINCT t.tag) = ? " : "") +
    "ORDER BY m.updated_at DESC LIMIT ?";
  const rows = await env.DB.prepare(sql)
    .bind(
      tenantId,
      q,
      q,
      q,
      includeArchived ? 1 : 0,
      filters?.namespace ?? null,
      filters?.namespace ?? null,
      filters?.project_key ?? null,
      filters?.project_key ?? null,
      filters?.memory_type ?? null,
      filters?.memory_type ?? null,
      ...tagFilter,
      ...(tagFilter.length ? [tagFilter.length] : []),
      limit
    )
    .all<MemoryRecord>();
  return rows.results ?? [];
}

export async function listActive(env: { DB: D1Database }, tenantId: string): Promise<MemoryRecord[]> {
  const rows = await env.DB.prepare("SELECT * FROM memories WHERE tenant_id = ? AND status = 'active' ORDER BY updated_at DESC").bind(tenantId).all<MemoryRecord>();
  return rows.results ?? [];
}

export async function latestVersionMeta(env: { DB: D1Database }, tenantId: string, memoryId: string): Promise<{ created_at: string; change_reason: string | null } | null> {
  return (
    (await env.DB.prepare("SELECT created_at, change_reason FROM memory_versions WHERE tenant_id = ? AND memory_id = ? ORDER BY created_at DESC LIMIT 1")
      .bind(tenantId, memoryId)
      .first<{ created_at: string; change_reason: string | null }>()) ?? null
  );
}

export async function createJob(env: { DB: D1Database }, input: { tenant_id: string; type: JobType; requested_by_key_id: string | null }): Promise<JobRecord> {
  const now = new Date().toISOString();
  const job: JobRecord = {
    id: createId(),
    tenant_id: input.tenant_id,
    type: input.type,
    status: "queued",
    requested_by_key_id: input.requested_by_key_id,
    cursor: null,
    result_object_key: null,
    error: null,
    created_at: now,
    updated_at: now,
    started_at: null,
    finished_at: null
  };
  await env.DB.prepare(
    "INSERT INTO jobs(id, tenant_id, type, status, requested_by_key_id, cursor, result_object_key, error, created_at, updated_at, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(job.id, job.tenant_id, job.type, job.status, job.requested_by_key_id, job.cursor, job.result_object_key, job.error, job.created_at, job.updated_at, job.started_at, job.finished_at)
    .run();
  return job;
}

export async function getJobById(env: { DB: D1Database }, id: string): Promise<JobRecord | null> {
  return (await env.DB.prepare("SELECT * FROM jobs WHERE id = ?").bind(id).first<JobRecord>()) ?? null;
}

export async function updateJob(
  env: { DB: D1Database },
  id: string,
  input: Partial<Pick<JobRecord, "status" | "cursor" | "result_object_key" | "error" | "started_at" | "finished_at">>
): Promise<void> {
  const existing = await getJobById(env, id);
  if (!existing) return;
  const next = { ...existing, ...input, updated_at: new Date().toISOString() };
  await env.DB.prepare(
    "UPDATE jobs SET status = ?, cursor = ?, result_object_key = ?, error = ?, updated_at = ?, started_at = ?, finished_at = ? WHERE id = ?"
  )
    .bind(next.status, next.cursor, next.result_object_key, next.error, next.updated_at, next.started_at, next.finished_at, id)
    .run();
}

const USAGE_FIELDS = ["mcp_reads", "mcp_writes", "job_submissions", "embedding_requests", "vector_queries"] as const;
type UsageField = (typeof USAGE_FIELDS)[number];

export async function incrementUsage(env: { DB: D1Database }, tenantId: string, field: UsageField, amount = 1): Promise<void> {
  if (!USAGE_FIELDS.includes(field)) throw new Error("invalid usage field");
  const day = new Date().toISOString().slice(0, 10);
  await env.DB.prepare(
    `INSERT INTO usage_daily(tenant_id, day, ${field}) VALUES (?, ?, ?) ON CONFLICT(tenant_id, day) DO UPDATE SET ${field} = ${field} + excluded.${field}`
  )
    .bind(tenantId, day, amount)
    .run();
}
