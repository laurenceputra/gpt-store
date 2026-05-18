import { createId, createMemory, insertAuditLog, isValidMemoryType, replaceTags } from "../db/d1";
import type { ToolContext } from "../types";

export async function writeMemory(input: any, ctx: ToolContext) {
  const title = String(input?.title ?? "").trim();
  const body = String(input?.body ?? "").trim();
  const namespace = String(input?.namespace ?? "").trim();
  const memory_type = String(input?.memory_type ?? "");
  if (!title || !body || !namespace) throw new Error("title, body, and namespace are required");
  if (body.length > 50000) throw new Error("body too long");
  if (!isValidMemoryType(memory_type)) throw new Error("invalid memory_type");
  if (memory_type === "executed_state" && input?.confirmed_executed !== true) throw new Error("executed_state requires confirmed_executed=true");

  const id = createId();
  const created = await createMemory(ctx.env, {
    id,
    title,
    body,
    namespace,
    project_key: input?.project_key === undefined || input?.project_key === null ? null : String(input.project_key),
    memory_type,
    status: "active",
    source: input?.source ? String(input.source) : null,
    raw_object_key: input?.raw_object_key ? String(input.raw_object_key) : null
  });
  const tags = Array.isArray(input?.tags) ? input.tags.map(String).slice(0, 50) : [];
  await replaceTags(ctx.env, id, tags);
  await insertAuditLog(ctx.env, "write_memory", id, { memory_type, tags_count: tags.length });
  await ctx.env.INDEX_QUEUE.send({ memory_id: id });
  return { id, indexing: "queued", created_at: created.created_at };
}
