import { getMemoryById, insertAuditLog, isValidMemoryType, isValidStatus, replaceTags, saveVersion, updateMemory } from "../db/d1";
import type { ToolContext } from "../types";

const DISALLOWED_FOR_EXECUTED = /(review_state|draft|candidate|planned|proposed|pending)/i;

export async function updateMemoryTool(input: any, ctx: ToolContext) {
  const id = String(input?.id ?? "");
  const change_reason = String(input?.change_reason ?? "").trim();
  if (!id) throw new Error("id required");
  if (!change_reason) throw new Error("change_reason required");
  const existing = await getMemoryById(ctx.env, id);
  if (!existing) throw new Error("memory not found");

  const title = String(input?.title ?? existing.title).trim();
  const body = String(input?.body ?? existing.body).trim();
  if (!title || !body) throw new Error("title and body are required");
  if (body.length > 50000) throw new Error("body too long");
  const status = String(input?.status ?? existing.status);
  if (!isValidStatus(status)) throw new Error("invalid status");
  const memory_type = input?.memory_type !== undefined ? String(input.memory_type) : existing.memory_type;
  if (!isValidMemoryType(memory_type)) throw new Error("invalid memory_type");
  if (memory_type === "executed_state" && existing.memory_type !== "executed_state" && input?.confirmed_executed !== true) {
    throw new Error("executed_state requires confirmed_executed=true");
  }

  const source = input?.source !== undefined ? String(input.source) : existing.source;
  if (
    (existing.memory_type === "executed_state" || memory_type === "executed_state") &&
    (DISALLOWED_FOR_EXECUTED.test(`${title} ${body}`) || DISALLOWED_FOR_EXECUTED.test(String(source ?? "")))
  ) {
    throw new Error("cannot overwrite executed_state with review/proposed content");
  }

  await saveVersion(ctx.env, id, existing.body, body, change_reason);
  await updateMemory(ctx.env, id, { title, body, status, source: source ?? null, memory_type });
  if (Array.isArray(input?.tags)) {
    await replaceTags(ctx.env, id, input.tags.map(String));
  }
  await insertAuditLog(ctx.env, "update_memory", id, { change_reason });
  await ctx.env.INDEX_QUEUE.send({ memory_id: id });
  return { id, updated: true, indexing: "queued" };
}
