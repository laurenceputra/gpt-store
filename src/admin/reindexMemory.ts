import { listActive } from "../db/d1";

export async function reindexMemory(env: any) {
  const rows = await listActive(env);
  for (const row of rows) {
    await env.INDEX_QUEUE.send({ memory_id: row.id });
  }
  return { queued: rows.length };
}
