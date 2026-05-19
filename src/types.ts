export const MEMORY_TYPES = [
  "durable_principle",
  "executed_state",
  "review_state",
  "open_item",
  "next_action",
  "decision_log",
  "preference",
  "source_index"
] as const;

export const MEMORY_STATUSES = ["active", "archived", "superseded"] as const;

export const API_KEY_ROLES = ["operator", "tenant_admin", "tenant_writer", "tenant_reader"] as const;

export const API_KEY_STATUSES = ["active", "revoked"] as const;

export const TENANT_STATUSES = ["active", "suspended"] as const;

export const JOB_TYPES = ["export", "reindex"] as const;

export const JOB_STATUSES = ["queued", "running", "succeeded", "failed"] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];
export type ApiKeyRole = (typeof API_KEY_ROLES)[number];
export type ApiKeyStatus = (typeof API_KEY_STATUSES)[number];
export type TenantStatus = (typeof TENANT_STATUSES)[number];
export type JobType = (typeof JOB_TYPES)[number];
export type JobStatus = (typeof JOB_STATUSES)[number];

export interface AuthContext {
  apiKeyId: string;
  tenantId: string | null;
  role: ApiKeyRole;
  keyLabel: string;
}

export interface TenantRecord {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  created_at: string;
  updated_at: string;
}

export interface ApiKeyRecord {
  id: string;
  tenant_id: string | null;
  role: ApiKeyRole;
  label: string;
  prefix: string;
  secret_hash: string;
  status: ApiKeyStatus;
  expires_at: string | null;
  last_used_at: string | null;
  created_by_key_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobRecord {
  id: string;
  tenant_id: string | null;
  type: JobType;
  status: JobStatus;
  requested_by_key_id: string | null;
  cursor: string | null;
  result_object_key: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface MemoryRecord {
  id: string;
  tenant_id: string;
  title: string;
  body: string;
  namespace: string;
  project_key: string | null;
  memory_type: MemoryType;
  status: MemoryStatus;
  source: string | null;
  raw_object_key?: string | null;
  created_at: string;
  updated_at: string;
  tags?: string[];
}

export interface Env {
  DB: D1Database;
  VECTORIZE?: VectorizeIndex;
  AI?: Ai;
  INDEX_QUEUE: Queue;
  MEMORY_BUCKET: R2Bucket;
  BOOTSTRAP_TOKEN: string;
  AUTH_PEPPER: string;
}

export interface ToolContext {
  env: Env;
  auth: AuthContext;
}
