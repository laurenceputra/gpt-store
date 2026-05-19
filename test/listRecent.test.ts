import { describe, expect, it, vi } from "vitest";

const { listRecentMock } = vi.hoisted(() => ({
  listRecentMock: vi.fn(async () => [])
}));

vi.mock("../src/db/d1", () => ({
  listRecent: listRecentMock,
  getTags: vi.fn(async () => [])
}));

import { listRecentMemory } from "../src/tools/listRecentMemory";

const auth = { apiKeyId: "k1", tenantId: "t1", role: "tenant_reader", keyLabel: "reader" } as const;

describe("list recent", () => {
  it("passes optional filters to DB query", async () => {
    await listRecentMemory({ namespace: "team-a", project_key: null, memory_type: "open_item", limit: 5 }, { env: {} as any, auth });
    expect(listRecentMock).toHaveBeenCalledWith(expect.anything(), "t1", 5, {
      namespace: "team-a",
      project_key: null,
      memory_type: "open_item"
    });
  });
});
