import type { MemoryRecord } from "../types";

export async function upsertMemoryVector(env: { VECTORIZE?: VectorizeIndex }, memory: MemoryRecord, values: number[]): Promise<void> {
  if (!env.VECTORIZE) return;
  await env.VECTORIZE.upsert([
    {
      id: memory.id,
      values,
      metadata: {
        memory_id: memory.id,
        namespace: memory.namespace,
        ...(memory.project_key !== null ? { project_key: memory.project_key } : {}),
        memory_type: memory.memory_type,
        status: memory.status,
        updated_at: memory.updated_at
      }
    }
  ]);
}

export async function queryVectors(
  env: { VECTORIZE?: VectorizeIndex },
  values: number[],
  limit: number,
  filter?: VectorizeVectorMetadataFilter
): Promise<string[]> {
  if (!env.VECTORIZE) return [];
  const result = await env.VECTORIZE.query(values, { topK: limit, filter, returnMetadata: true });
  return (result.matches ?? []).map((m) => m.id);
}

export async function removeVector(env: { VECTORIZE?: VectorizeIndex }, id: string): Promise<void> {
  if (!env.VECTORIZE) return;
  const maybeDelete = (env.VECTORIZE as unknown as { deleteByIds?: (ids: string[]) => Promise<void> }).deleteByIds;
  if (maybeDelete) {
    await maybeDelete.call(env.VECTORIZE, [id]);
    return;
  }
  console.warn("VECTORIZE deleteByIds unavailable; archive vector not explicitly removed", { id });
}
