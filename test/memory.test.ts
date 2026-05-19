import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/db/d1", () => ({
  createId: () => "m1",
  isValidMemoryType: (v: string) => ["executed_state", "open_item"].includes(v),
  createMemory: vi.fn(async (_env, tenantId, input) => ({ ...input, tenant_id: tenantId, created_at: new Date().toISOString() })),
  replaceTags: vi.fn(async () => {}),
  insertAuditLog: vi.fn(async () => {}),
  getMemoryById: vi.fn(async () => ({ id: "m1", tenant_id: "t1", title: "t", body: "b", status: "active", memory_type: "open_item", source: null })),
  updateMemory: vi.fn(async () => {}),
  incrementUsage: vi.fn(async () => {})
}));

vi.mock("../src/vector/vectorize", () => ({ removeVector: vi.fn(async () => {}) }));

import { writeMemory } from "../src/tools/writeMemory";
import { archiveMemory } from "../src/tools/archiveMemory";
import { handleIndexQueue } from "../src/queues/indexMemory";
import { embedText } from "../src/vector/embed";

vi.mock("../src/vector/embed", () => ({ embedText: vi.fn(async () => [0.1, 0.2, 0.3]) }));

const env = { INDEX_QUEUE: { send: vi.fn(async () => {}) } } as any;
const auth = { apiKeyId: "k1", tenantId: "t1", role: "tenant_writer", keyLabel: "writer" } as const;

describe("memory tools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("normal write succeeds", async () => {
    const out = await writeMemory({ title: "A", body: "B", namespace: "ns", memory_type: "open_item" }, { env, auth });
    expect(out.id).toBe("m1");
    expect(env.INDEX_QUEUE.send).toHaveBeenCalled();
  });

  it("write requires namespace", async () => {
    await expect(writeMemory({ title: "A", body: "B", memory_type: "open_item" }, { env, auth })).rejects.toThrow(/namespace/);
  });

  it("executed_state without confirmation fails", async () => {
    await expect(writeMemory({ title: "A", body: "B", namespace: "ns", memory_type: "executed_state" }, { env, auth })).rejects.toThrow(/confirmed_executed/);
  });

  it("executed_state with confirmation succeeds", async () => {
    const out = await writeMemory({ title: "A", body: "B", namespace: "ns", memory_type: "executed_state", confirmed_executed: true }, { env, auth });
    expect(out.indexing).toBe("queued");
  });

  it("archive soft delete", async () => {
    const out = await archiveMemory({ id: "m1", change_reason: "stale" }, { env, auth });
    expect(out.status).toBe("archived");
  });

  it("queue indexing handler process valid memory ID", async () => {
    const ack = vi.fn();
    await handleIndexQueue({ messages: [{ body: { tenant_id: "t1", memory_id: "m1" }, ack, retry: vi.fn() }] } as any, env);
    expect(ack).toHaveBeenCalled();
  });

  it("acks queue message when embedding is unavailable", async () => {
    (embedText as any).mockResolvedValueOnce(null);
    const ack = vi.fn();
    const retry = vi.fn();
    await handleIndexQueue({ messages: [{ body: { tenant_id: "t1", memory_id: "m1" }, ack, retry }] } as any, env);
    expect(ack).toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled();
  });
});
