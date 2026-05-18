import { getMemoryById, getTags, searchKeyword } from "../db/d1";
import { embedText } from "../vector/embed";
import { queryVectors } from "../vector/vectorize";
import type { ToolContext } from "../types";

export async function searchMemory(input: any, ctx: ToolContext) {
  const query = String(input?.query ?? "").trim();
  if (!query) throw new Error("query required");
  const limit = Math.min(20, Math.max(1, Number(input?.limit ?? 8)));
  const includeArchived = input?.include_archived === true;
  const namespace = input?.namespace !== undefined ? String(input.namespace).trim() : undefined;
  const project_key = input?.project_key === undefined ? undefined : input.project_key === null ? null : String(input.project_key);
  const memory_type = input?.memory_type !== undefined ? String(input.memory_type) : undefined;
  const tags = Array.isArray(input?.tags) ? input.tags.map(String).map((t: string) => t.trim()).filter(Boolean) : undefined;
  const ids: string[] = [];
  const semanticTagsById = new Map<string, string[]>();

  try {
    const vector = await embedText(ctx.env, query);
    if (vector) {
      const filter: Record<string, unknown> = {};
      if (!includeArchived) filter.status = "active";
      if (namespace) filter.namespace = namespace;
      if (project_key !== undefined) filter.project_key = project_key;
      if (memory_type) filter.memory_type = memory_type;
      ids.push(...(await queryVectors(ctx.env, vector, limit, Object.keys(filter).length ? (filter as VectorizeVectorMetadataFilter) : undefined)));
    }
  } catch {
    // fallback below
  }

  const semanticRows = (await Promise.all(ids.map((id) => getMemoryById(ctx.env, id)))).filter(Boolean) as any[];
  const semantic = tags?.length
    ? (
        await Promise.all(
          semanticRows.map(async (row) => {
            const rowTags = (await getTags(ctx.env, row.id)).map((t) => String(t).trim());
            semanticTagsById.set(row.id, rowTags);
            const hasAllTags = tags.every((tag: string) => rowTags.includes(tag));
            return hasAllTags ? row : null;
          })
        )
      ).filter(Boolean) as any[]
    : semanticRows;
  const keyword = await searchKeyword(ctx.env, query, includeArchived, limit, { namespace, project_key, memory_type: memory_type as any, tags });
  const merged = new Map<string, any>();
  for (const row of semantic) merged.set(row.id, { ...row, score: 2 });
  for (const row of keyword) {
    const projectExact = typeof row.project_key === "string" && row.project_key.toLowerCase() === query.toLowerCase();
    const exactBoost = row.title.toLowerCase() === query.toLowerCase() || projectExact ? 3 : 1;
    const cur = merged.get(row.id);
    merged.set(row.id, { ...row, score: Math.max(cur?.score ?? 0, exactBoost) });
  }

  const records = await Promise.all(
    [...merged.values()]
      .filter((m) => includeArchived || m.status !== "archived")
      .sort((a, b) => (b.score - a.score) || b.updated_at.localeCompare(a.updated_at))
      .slice(0, limit)
      .map(async (m) => ({
        id: m.id,
        title: m.title,
        namespace: m.namespace,
        project_key: m.project_key,
        memory_type: m.memory_type,
        updated_at: m.updated_at,
        tags: semanticTagsById.get(m.id) ?? await getTags(ctx.env, m.id),
        snippet: m.body.slice(0, 180)
      }))
  );
  return { records };
}
