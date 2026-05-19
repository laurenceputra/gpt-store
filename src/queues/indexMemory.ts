import { getMemoryById, incrementUsage } from "../db/d1";
import { processJob } from "../jobs/jobs";
import { embedText } from "../vector/embed";
import { removeVector, upsertMemoryVector } from "../vector/vectorize";
import type { Env } from "../types";

export async function indexMemoryById(env: Env, tenantId: string, memoryId: string): Promise<void> {
  const memory = await getMemoryById(env, tenantId, memoryId);
  if (!memory) return;
  if (memory.status === "archived") {
    await removeVector(env, memory.id).catch(() => undefined);
    return;
  }
  if (!env.AI) {
    console.warn("AI binding unavailable; memory was not semantically indexed", { tenantId, memoryId });
    return;
  }
  void incrementUsage(env, tenantId, "embedding_requests").catch(() => undefined);
  const embedding = await embedText(env, `${memory.title}\n${memory.body}`);
  if (!embedding) {
    console.warn("embedding unavailable; memory was not semantically indexed", { tenantId, memoryId });
    return;
  }
  await upsertMemoryVector(env, memory, embedding);
}

export async function handleIndexQueue(batch: MessageBatch<any>, env: Env): Promise<void> {
  for (const msg of batch.messages) {
    try {
      const jobId = String(msg.body?.job_id ?? "");
      if (jobId) {
        await processJob(env, jobId);
        msg.ack();
        continue;
      }
      const tenantId = String(msg.body?.tenant_id ?? "");
      const memoryId = String(msg.body?.memory_id ?? "");
      if (!tenantId || !memoryId) {
        msg.ack();
        continue;
      }
      await indexMemoryById(env, tenantId, memoryId);
      msg.ack();
    } catch (err) {
      console.error("index queue failure", err);
      msg.retry();
    }
  }
}
