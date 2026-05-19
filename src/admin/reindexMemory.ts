import { reindexTenantMemory } from "../jobs/jobs";
import type { Env } from "../types";

export async function reindexMemory(env: Env, tenantId: string) {
  return reindexTenantMemory(env, tenantId);
}
