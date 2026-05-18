import { getTags, listRecent } from "../db/d1";
import type { ToolContext } from "../types";

export async function listRecentMemory(input: any, ctx: ToolContext) {
  const limit = Math.min(20, Math.max(1, Number(input?.limit ?? 10)));
  const namespace = input?.namespace !== undefined ? String(input.namespace).trim() : undefined;
  const project_key = input?.project_key === undefined ? undefined : input.project_key === null ? null : String(input.project_key);
  const memory_type = input?.memory_type !== undefined ? String(input.memory_type) : undefined;
  const rows = await listRecent(ctx.env, limit, { namespace, project_key, memory_type: memory_type as any });
  const records = await Promise.all(
    rows.map(async (m) => ({
      id: m.id,
      title: m.title,
      namespace: m.namespace,
      project_key: m.project_key,
      memory_type: m.memory_type,
      updated_at: m.updated_at,
      tags: await getTags(ctx.env, m.id),
      snippet: m.body.slice(0, 180)
    }))
  );
  return { records };
}
