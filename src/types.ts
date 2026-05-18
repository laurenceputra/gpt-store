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

export type MemoryType = (typeof MEMORY_TYPES)[number];
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export interface MemoryRecord {
  id: string;
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
  MCP_BEARER_TOKEN: string;
  ADMIN_BEARER_TOKEN: string;
}

export interface ToolContext {
  env: Env;
}
