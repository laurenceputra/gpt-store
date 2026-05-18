import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/db/d1", () => ({
  createId: () => "m1",
  isValidMemoryType: (v: string) => ["executed_state", "open_item"].includes(v),
  createMemory: vi.fn(async (_env, input) => ({ ...input, created_at: new Date().toISOString() })),
  replaceTags: vi.fn(async () => {}),
  insertAuditLog: vi.fn(async () => {}),
  getMemoryById: vi.fn(async () => ({ id: "m1", title: "t", body: "b", status: "active", memory_type: "open_item", source: null })),
  updateMemory: vi.fn(async () => {})
}));

vi.mock("../src/vector/vectorize", () => ({ removeVector: vi.fn(async () => {}) }));

import { writeMemory } from "../src/tools/writeMemory";
import { archiveMemory } from "../src/tools/archiveMemory";
import { handleIndexQueue } from "../src/queues/indexMemory";

const env = { INDEX_QUEUE: { send: vi.fn(async () => {}) } } as any;

describe("memory tools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("normal write succeeds", async () => {
    const out = await writeMemory({ title: "A", body: "B", namespace: "ns", memory_type: "open_item" }, { env });
    expect(out.id).toBe("m1");
    expect(env.INDEX_QUEUE.send).toHaveBeenCalled();
  });

  it("write requires namespace", async () => {
    await expect(writeMemory({ title: "A", body: "B", memory_type: "open_item" }, { env })).rejects.toThrow(/namespace/);
  });

  it("executed_state without confirmation fails", async () => {
    await expect(writeMemory({ title: "A", body: "B", namespace: "ns", memory_type: "executed_state" }, { env })).rejects.toThrow(/confirmed_executed/);
  });

  it("executed_state with confirmation succeeds", async () => {
    const out = await writeMemory({ title: "A", body: "B", namespace: "ns", memory_type: "executed_state", confirmed_executed: true }, { env });
    expect(out.indexing).toBe("queued");
  });

  it("archive soft delete", async () => {
    const out = await archiveMemory({ id: "m1", change_reason: "stale" }, { env });
    expect(out.status).toBe("archived");
  });

  it("queue indexing handler process valid memory ID", async () => {
    const ack = vi.fn();
    await handleIndexQueue({ messages: [{ body: { memory_id: "m1" }, ack, retry: vi.fn() }] } as any, env);
    expect(ack).toHaveBeenCalled();
  });
});
