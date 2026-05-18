import { describe, expect, it, vi } from "vitest";

const { searchKeywordMock, getMemoryByIdMock, getTagsMock, embedTextMock, queryVectorsMock } = vi.hoisted(() => ({
  searchKeywordMock: vi.fn(async () => [
    { id: "a", title: "alpha", body: "hello", namespace: "n", project_key: "p", memory_type: "open_item", updated_at: "2026-01-01", status: "active" },
    { id: "b", title: "beta", body: "arch", namespace: "n", project_key: "p", memory_type: "open_item", updated_at: "2026-01-01", status: "archived" }
  ]),
  getMemoryByIdMock: vi.fn(async (_env: any, _id: string) => null),
  getTagsMock: vi.fn(async (_env: any, _id: string) => [] as string[]),
  embedTextMock: vi.fn(async () => {
    throw new Error("no ai");
  }),
  queryVectorsMock: vi.fn(async () => [] as string[])
}));

vi.mock("../src/db/d1", () => ({
  searchKeyword: searchKeywordMock,
  getMemoryById: getMemoryByIdMock,
  getTags: getTagsMock
}));

vi.mock("../src/vector/embed", () => ({ embedText: embedTextMock }));
vi.mock("../src/vector/vectorize", () => ({ queryVectors: queryVectorsMock }));

import { searchMemory } from "../src/tools/searchMemory";

describe("search", () => {
  it("filters semantic hits by requested tags while allowing keyword matches", async () => {
    (embedTextMock as any).mockResolvedValueOnce([0.1, 0.2, 0.3]);
    (queryVectorsMock as any).mockResolvedValueOnce(["sem-no-tag", "sem-with-tag"]);
    (getMemoryByIdMock as any).mockImplementation(async (_env: any, id: string) => {
      if (id === "sem-no-tag") return { id, title: "semantic no tag", body: "sem", namespace: "n", project_key: "p", memory_type: "open_item", updated_at: "2026-01-03", status: "active" };
      if (id === "sem-with-tag") return { id, title: "semantic yes tag", body: "sem", namespace: "n", project_key: "p", memory_type: "open_item", updated_at: "2026-01-02", status: "active" };
      return null;
    });
    (getTagsMock as any).mockImplementation(async (_env: any, id: string) => {
      if (id === "sem-no-tag") return ["other"];
      if (id === "sem-with-tag") return ["urgent", "backend"];
      if (id === "a") return ["urgent"];
      return [];
    });

    const out = await searchMemory({ query: "hello", tags: ["urgent"] }, { env: {} as any });
    expect(out.records.map((r: any) => r.id)).toContain("sem-with-tag");
    expect(out.records.map((r: any) => r.id)).toContain("a");
    expect(out.records.map((r: any) => r.id)).not.toContain("sem-no-tag");
  });

  it("search excludes archived by default", async () => {
    const out = await searchMemory({ query: "hello" }, { env: {} as any });
    expect(out.records.find((r: any) => r.id === "b")).toBeUndefined();
  });

  it("D1 keyword fallback when Vectorize fails", async () => {
    const out = await searchMemory({ query: "hello" }, { env: {} as any });
    expect(out.records.length).toBeGreaterThan(0);
  });

  it("passes optional filters to D1 fallback", async () => {
    await searchMemory({ query: "hello", namespace: "team-a", project_key: null, memory_type: "open_item", tags: ["urgent"] }, { env: {} as any });
    expect(searchKeywordMock).toHaveBeenCalledWith(
      expect.anything(),
      "hello",
      false,
      8,
      { namespace: "team-a", project_key: null, memory_type: "open_item", tags: ["urgent"] }
    );
  });
});
