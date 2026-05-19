import { assertRole, requireTenant } from "../auth/auth";
import { getMemoryById, latestVersionMeta } from "../db/d1";
import type { ToolContext } from "../types";

export async function getMemory(input: any, ctx: ToolContext) {
  assertRole(ctx.auth, ["tenant_reader", "tenant_writer", "tenant_admin"]);
  const tenantId = requireTenant(ctx.auth);
  const id = String(input?.id ?? "");
  if (!id) throw new Error("id required");
  const memory = await getMemoryById(ctx.env, tenantId, id);
  if (!memory) return { found: false };
  const latest_version = await latestVersionMeta(ctx.env, tenantId, id);
  return { found: true, memory, latest_version };
}
