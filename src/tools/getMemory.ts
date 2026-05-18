import { getMemoryById, latestVersionMeta } from "../db/d1";
import type { ToolContext } from "../types";

export async function getMemory(input: any, ctx: ToolContext) {
  const id = String(input?.id ?? "");
  if (!id) throw new Error("id required");
  const memory = await getMemoryById(ctx.env, id);
  if (!memory) return { found: false };
  const latest_version = await latestVersionMeta(ctx.env, id);
  return { found: true, memory, latest_version };
}
