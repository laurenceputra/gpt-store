import { getMemoryById } from "../db/d1";
import { embedText } from "../vector/embed";
import { removeVector, upsertMemoryVector } from "../vector/vectorize";

export async function indexMemoryById(env: any, memoryId: string): Promise<void> {
  const memory = await getMemoryById(env, memoryId);
  if (!memory) return;
  if (memory.status === "archived") {
    await removeVector(env, memory.id).catch(() => undefined);
    return;
  }
  const embedding = await embedText(env, `${memory.title}\n${memory.body}`);
  if (!embedding) return;
  await upsertMemoryVector(env, memory, embedding);
}

export async function handleIndexQueue(batch: MessageBatch<any>, env: any): Promise<void> {
  for (const msg of batch.messages) {
    try {
      const memoryId = String(msg.body?.memory_id ?? "");
      if (!memoryId) continue;
      await indexMemoryById(env, memoryId);
      msg.ack();
    } catch (err) {
      console.error("index queue failure", err);
      msg.retry();
    }
  }
}
