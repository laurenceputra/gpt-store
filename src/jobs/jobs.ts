import { getJobById, getTags, incrementUsage, listActive, updateJob } from "../db/d1";
import type { Env, JobRecord } from "../types";

export async function exportTenantMemory(env: Env, tenantId: string): Promise<{ key: string; count: number }> {
  const rows = await listActive(env, tenantId);
  const lines: string[] = [];
  for (const row of rows) {
    lines.push(JSON.stringify({ ...row, tags: await getTags(env, tenantId, row.id) }));
  }
  const ts = new Date().toISOString().replace(/:/g, "-");
  const key = `exports/${tenantId}/memory-export-${ts}.jsonl`;
  await env.MEMORY_BUCKET.put(key, `${lines.join("\n")}\n`, {
    httpMetadata: { contentType: "application/jsonl" }
  });
  return { key, count: rows.length };
}

export async function reindexTenantMemory(env: Env, tenantId: string): Promise<{ queued: number }> {
  const rows = await listActive(env, tenantId);
  for (const row of rows) {
    await env.INDEX_QUEUE.send({ tenant_id: tenantId, memory_id: row.id });
  }
  return { queued: rows.length };
}

async function runJob(env: Env, job: JobRecord): Promise<{ resultObjectKey: string | null; cursor: string | null }> {
  if (!job.tenant_id) throw new Error("tenant-scoped job required");
  if (job.type === "export") {
    const result = await exportTenantMemory(env, job.tenant_id);
    return { resultObjectKey: result.key, cursor: String(result.count) };
  }
  if (job.type === "reindex") {
    const result = await reindexTenantMemory(env, job.tenant_id);
    return { resultObjectKey: null, cursor: String(result.queued) };
  }
  throw new Error(`unsupported job type: ${job.type}`);
}

export async function processJob(env: Env, jobId: string): Promise<void> {
  const job = await getJobById(env, jobId);
  if (!job || job.status !== "queued") return;
  const startedAt = new Date().toISOString();
  await updateJob(env, job.id, { status: "running", started_at: startedAt, error: null });
  try {
    const result = await runJob(env, job);
    await updateJob(env, job.id, {
      status: "succeeded",
      cursor: result.cursor,
      result_object_key: result.resultObjectKey,
      finished_at: new Date().toISOString(),
      error: null
    });
  } catch (err) {
    await updateJob(env, job.id, {
      status: "failed",
      error: err instanceof Error ? err.message : "job failed",
      finished_at: new Date().toISOString()
    });
  }
}

export function enqueueJob(env: Env, tenantId: string, jobId: string): Promise<void> {
  void incrementUsage(env, tenantId, "job_submissions").catch(() => undefined);
  return env.INDEX_QUEUE.send({ job_id: jobId }).then(() => undefined);
}
