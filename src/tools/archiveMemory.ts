import { getMemoryById, insertAuditLog, updateMemory } from "../db/d1";
import { removeVector } from "../vector/vectorize";
import type { ToolContext } from "../types";

export async function archiveMemory(input: any, ctx: ToolContext) {
  const id = String(input?.id ?? "");
  const change_reason = String(input?.change_reason ?? "").trim();
  if (!id) throw new Error("id required");
  if (!change_reason) throw new Error("change_reason required");
  const existing = await getMemoryById(ctx.env, id);
  if (!existing) throw new Error("memory not found");
  await updateMemory(ctx.env, id, { title: existing.title, body: existing.body, status: "archived", source: existing.source });
  await insertAuditLog(ctx.env, "archive_memory", id, { change_reason });
  await removeVector(ctx.env, id).catch(() => undefined);
  return { success: true, id, status: "archived" };
}
