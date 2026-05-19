import { exportTenantMemory } from "../jobs/jobs";
import type { Env } from "../types";

export async function exportMemory(env: Env, tenantId: string) {
  return exportTenantMemory(env, tenantId);
}
