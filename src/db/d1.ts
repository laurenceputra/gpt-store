import { MEMORY_STATUSES, MEMORY_TYPES, type MemoryRecord, type MemoryStatus, type MemoryType } from "../types";

export function isValidMemoryType(value: string): value is MemoryType {
  return MEMORY_TYPES.includes(value as MemoryType);
}

export function isValidStatus(value: string): value is MemoryStatus {
  return MEMORY_STATUSES.includes(value as MemoryStatus);
}

export function createId(): string {
  return crypto.randomUUID();
}

export async function createMemory(env: { DB: D1Database }, input: Omit<MemoryRecord, "created_at" | "updated_at">): Promise<MemoryRecord> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO memories (id, namespace, project_key, memory_type, title, body, status, source, raw_object_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(
      input.id,
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
  return { ...input, created_at: now, updated_at: now };
}

export async function getMemoryById(env: { DB: D1Database }, id: string): Promise<MemoryRecord | null> {
  const result = await env.DB.prepare("SELECT * FROM memories WHERE id = ?").bind(id).first<MemoryRecord>();
  if (!result) return null;
  const tags = await getTags(env, id);
  return { ...result, tags };
}

export async function replaceTags(env: { DB: D1Database }, memoryId: string, tags: string[]): Promise<void> {
  await env.DB.prepare("DELETE FROM memory_tags WHERE memory_id = ?").bind(memoryId).run();
  for (const tag of tags) {
    await env.DB.prepare("INSERT OR IGNORE INTO memory_tags(memory_id, tag) VALUES (?, ?)").bind(memoryId, tag).run();
  }
}

export async function getTags(env: { DB: D1Database }, memoryId: string): Promise<string[]> {
  const rows = await env.DB.prepare("SELECT tag FROM memory_tags WHERE memory_id = ? ORDER BY tag ASC").bind(memoryId).all<{ tag: string }>();
  return (rows.results ?? []).map((r) => r.tag);
}

export async function saveVersion(
  env: { DB: D1Database },
  memoryId: string,
  previousBody: string,
  newBody: string,
  changeReason: string
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO memory_versions(id, memory_id, previous_body, new_body, change_reason, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(createId(), memoryId, previousBody, newBody, changeReason, new Date().toISOString())
    .run();
}

export async function updateMemory(
  env: { DB: D1Database },
  id: string,
  input: { title: string; body: string; status: MemoryStatus; source: string | null; memory_type?: MemoryType }
): Promise<void> {
  await env.DB.prepare("UPDATE memories SET title = ?, body = ?, status = ?, source = ?, memory_type = COALESCE(?, memory_type), updated_at = ? WHERE id = ?")
    .bind(input.title, input.body, input.status, input.source, input.memory_type ?? null, new Date().toISOString(), id)
    .run();
}

export async function insertAuditLog(env: { DB: D1Database }, action: string, memoryId: string | null, detail: unknown): Promise<void> {
  await env.DB.prepare("INSERT INTO audit_log(id, action, memory_id, tool_name, request_summary, actor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(createId(), action, memoryId, action, JSON.stringify(detail ?? {}), "mcp", new Date().toISOString())
    .run();
}

export async function listRecent(
  env: { DB: D1Database },
  limit: number,
  filters?: { namespace?: string; project_key?: string | null; memory_type?: MemoryType }
): Promise<MemoryRecord[]> {
  const rows = await env.DB.prepare(
    "SELECT * FROM memories WHERE status = 'active' AND (? IS NULL OR namespace = ?) AND (? IS NULL OR project_key = ?) AND (? IS NULL OR memory_type = ?) ORDER BY updated_at DESC LIMIT ?"
  )
    .bind(filters?.namespace ?? null, filters?.namespace ?? null, filters?.project_key ?? null, filters?.project_key ?? null, filters?.memory_type ?? null, filters?.memory_type ?? null, limit)
    .all<MemoryRecord>();
  return rows.results ?? [];
}

export async function searchKeyword(
  env: { DB: D1Database },
  query: string,
  includeArchived: boolean,
  limit: number,
  filters?: { namespace?: string; project_key?: string | null; memory_type?: MemoryType; tags?: string[] }
): Promise<MemoryRecord[]> {
  const q = `%${query}%`;
  const tagFilter = Array.isArray(filters?.tags) ? filters.tags.map((t) => String(t).trim()).filter(Boolean) : [];
  const sql =
    "SELECT DISTINCT m.* FROM memories m " +
    (tagFilter.length ? "INNER JOIN memory_tags t ON t.memory_id = m.id " : "") +
    "WHERE (m.title LIKE ? OR m.body LIKE ? OR m.project_key LIKE ?) " +
    "AND (? OR m.status != 'archived') " +
    "AND (? IS NULL OR m.namespace = ?) " +
    "AND (? IS NULL OR m.project_key = ?) " +
    "AND (? IS NULL OR m.memory_type = ?) " +
    (tagFilter.length ? `AND t.tag IN (${tagFilter.map(() => "?").join(",")}) ` : "") +
    "ORDER BY m.updated_at DESC LIMIT ?";
  const rows = await env.DB.prepare(sql)
    .bind(
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
      limit
    )
    .all<MemoryRecord>();
  return rows.results ?? [];
}

export async function listActive(env: { DB: D1Database }): Promise<MemoryRecord[]> {
  const rows = await env.DB.prepare("SELECT * FROM memories WHERE status = 'active' ORDER BY updated_at DESC").all<MemoryRecord>();
  return rows.results ?? [];
}

export async function latestVersionMeta(env: { DB: D1Database }, memoryId: string): Promise<{ created_at: string; change_reason: string | null } | null> {
  return (
    (await env.DB.prepare("SELECT created_at, change_reason FROM memory_versions WHERE memory_id = ? ORDER BY created_at DESC LIMIT 1")
      .bind(memoryId)
      .first<{ created_at: string; change_reason: string | null }>()) ?? null
  );
}
