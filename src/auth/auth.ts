import { getApiKeyByPrefix, getTenantById, isValidApiKeyRole, markApiKeyUsed } from "../db/d1";
import type { ApiKeyRecord, ApiKeyRole, AuthContext, Env } from "../types";

const TOKEN_PREFIX = "mmcp";
const RANDOM_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-";
const LAST_USED_UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function bearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  return auth.slice(7).trim();
}

export function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json" } });
}

function randomString(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += RANDOM_ALPHABET[byte % RANDOM_ALPHABET.length];
  return out;
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashTokenSecret(prefix: string, secret: string, pepper: string): Promise<string> {
  const material = new TextEncoder().encode(`${pepper}:${prefix}:${secret}`);
  return toHex(await crypto.subtle.digest("SHA-256", material));
}

function constantTimeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export function generateApiToken(environment = "live"): { token: string; prefix: string; secret: string } {
  const prefix = randomString(12);
  const secret = randomString(40);
  return { token: `${TOKEN_PREFIX}_${environment}_${prefix}_${secret}`, prefix, secret };
}

export function parseApiToken(token: string): { environment: string; prefix: string; secret: string } | null {
  const parts = token.split("_");
  if (parts.length !== 4 || parts[0] !== TOKEN_PREFIX) return null;
  const [, environment, prefix, secret] = parts;
  if (!environment || !prefix || !secret) return null;
  return { environment, prefix, secret };
}

function isExpired(key: ApiKeyRecord, now = new Date()): boolean {
  if (key.expires_at === null) return false;
  const expiresAt = Date.parse(key.expires_at);
  if (!Number.isFinite(expiresAt)) return true;
  return expiresAt <= now.getTime();
}

async function maybeMarkUsed(env: Env, key: ApiKeyRecord, now: Date): Promise<void> {
  if (key.last_used_at && now.getTime() - Date.parse(key.last_used_at) < LAST_USED_UPDATE_INTERVAL_MS) return;
  await markApiKeyUsed(env, key.id, now.toISOString()).catch(() => undefined);
}

export async function authenticateRequest(req: Request, env: Env): Promise<AuthContext | Response> {
  const raw = bearerToken(req);
  if (!raw) return jsonError(401, "unauthorized");
  const parsed = parseApiToken(raw);
  if (!parsed) return jsonError(401, "unauthorized");

  const key = await getApiKeyByPrefix(env, parsed.prefix);
  if (!key || key.status !== "active" || !isValidApiKeyRole(key.role)) return jsonError(401, "unauthorized");
  if (isExpired(key)) return jsonError(401, "key_expired");
  if (key.tenant_id) {
    const tenant = await getTenantById(env, key.tenant_id);
    if (!tenant || tenant.status !== "active") return jsonError(403, "tenant_inactive");
  }

  const actualHash = await hashTokenSecret(parsed.prefix, parsed.secret, env.AUTH_PEPPER);
  if (!constantTimeEqual(actualHash, key.secret_hash)) return jsonError(401, "unauthorized");

  const now = new Date();
  await maybeMarkUsed(env, key, now);
  return { apiKeyId: key.id, tenantId: key.tenant_id, role: key.role, keyLabel: key.label };
}

export async function buildApiKeySecret(env: Env, environment = "live"): Promise<{ token: string; prefix: string; secret_hash: string }> {
  const generated = generateApiToken(environment);
  return {
    token: generated.token,
    prefix: generated.prefix,
    secret_hash: await hashTokenSecret(generated.prefix, generated.secret, env.AUTH_PEPPER)
  };
}

export function hasRole(auth: AuthContext, roles: ApiKeyRole[]): boolean {
  return roles.includes(auth.role);
}

export function assertRole(auth: AuthContext, roles: ApiKeyRole[]): void {
  if (!hasRole(auth, roles)) throw new Error("forbidden");
}

export function requireTenant(auth: AuthContext): string {
  if (!auth.tenantId) throw new Error("tenant-scoped key required");
  return auth.tenantId;
}

export function roleForbidden(auth: AuthContext, roles: ApiKeyRole[]): Response | null {
  return hasRole(auth, roles) ? null : jsonError(403, "forbidden");
}
