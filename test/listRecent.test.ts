import { describe, expect, it, vi } from "vitest";

const { listRecentMock } = vi.hoisted(() => ({
  listRecentMock: vi.fn(async () => [])
}));

vi.mock("../src/db/d1", () => ({
  listRecent: listRecentMock,
  getTags: vi.fn(async () => [])
}));

import { listRecentMemory } from "../src/tools/listRecentMemory";

describe("list recent", () => {
  it("passes optional filters to DB query", async () => {
    await listRecentMemory({ namespace: "team-a", project_key: null, memory_type: "open_item", limit: 5 }, { env: {} as any });
    expect(listRecentMock).toHaveBeenCalledWith(expect.anything(), 5, {
      namespace: "team-a",
      project_key: null,
      memory_type: "open_item"
    });
  });
});
