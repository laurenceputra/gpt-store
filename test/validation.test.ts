import { describe, expect, it, vi } from "vitest";

vi.mock("../src/db/d1", () => ({
  getMemoryById: vi.fn(async () => ({ id: "x", title: "Done", body: "Shipped", status: "active", memory_type: "executed_state", source: "prod" })),
  isValidMemoryType: (v: string) => ["executed_state", "open_item"].includes(v),
  isValidStatus: (v: string) => ["active", "archived", "superseded"].includes(v),
  saveVersion: vi.fn(async () => {}),
  updateMemory: vi.fn(async () => {}),
  replaceTags: vi.fn(async () => {}),
  insertAuditLog: vi.fn(async () => {})
}));

import { updateMemoryTool } from "../src/tools/updateMemory";

describe("validation", () => {
  it("updating executed_state with proposed content fails", async () => {
    await expect(
      updateMemoryTool({ id: "x", change_reason: "edit", body: "proposed approach" }, { env: { INDEX_QUEUE: { send: vi.fn() } } as any })
    ).rejects.toThrow(/cannot overwrite executed_state/);
  });
});
