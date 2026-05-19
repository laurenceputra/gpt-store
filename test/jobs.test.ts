import { describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    throwOnList: false,
    updates: [] as any[]
  }
}));

vi.mock("../src/db/d1", () => ({
  getJobById: vi.fn(async () => ({
    id: "job1",
    tenant_id: "t1",
    type: "export",
    status: "queued"
  })),
  listActive: vi.fn(async () => {
    if (state.throwOnList) throw new Error("boom");
    return [];
  }),
  getTags: vi.fn(async () => []),
  incrementUsage: vi.fn(async () => {}),
  updateJob: vi.fn(async (_env: any, _jobId: string, patch: any) => {
    state.updates.push(patch);
  })
}));

import { processJob } from "../src/jobs/jobs";

describe("processJob", () => {
  it("does not throw when job execution fails after persisting failed status", async () => {
    state.throwOnList = true;
    state.updates = [];
    const env = { MEMORY_BUCKET: { put: vi.fn() } } as any;

    await expect(processJob(env, "job1")).resolves.toBeUndefined();
    expect(state.updates.some((u) => u.status === "failed")).toBe(true);
  });
});
