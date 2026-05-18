import { getTags, listActive } from "../db/d1";

export async function exportMemory(env: any) {
  const rows = await listActive(env);
  const lines: string[] = [];
  for (const row of rows) {
    lines.push(JSON.stringify({ ...row, tags: await getTags(env, row.id) }));
  }
  const ts = new Date().toISOString().replace(/:/g, "-");
  const key = `exports/memory-export-${ts}.jsonl`;
  await env.MEMORY_BUCKET.put(key, `${lines.join("\n")}\n`, {
    httpMetadata: { contentType: "application/jsonl" }
  });
  return { key, count: rows.length };
}
