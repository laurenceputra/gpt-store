import { describe, expect, it, vi } from "vitest";

vi.mock("../src/jobs/jobs", () => ({
  processJob: vi.fn(async () => {
    throw new Error("transient queue failure");
  })
}));

vi.mock("../src/db/d1", () => ({
  getMemoryById: vi.fn(async () => null),
  incrementUsage: vi.fn(async () => {})
}));

import { handleIndexQueue } from "../src/queues/indexMemory";

describe("index queue", () => {
  it("retries on unexpected queue processing failure", async () => {
    const ack = vi.fn();
    const retry = vi.fn();
    await handleIndexQueue({ messages: [{ body: { job_id: "job1" }, ack, retry }] } as any, {} as any);
    expect(ack).not.toHaveBeenCalled();
    expect(retry).toHaveBeenCalled();
  });
});
