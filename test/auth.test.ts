import { describe, expect, it, vi } from "vitest";
import worker from "../src/index";

const env = {
  MCP_BEARER_TOKEN: "mcp",
  ADMIN_BEARER_TOKEN: "admin",
  DB: {} as any,
  INDEX_QUEUE: { send: vi.fn(async () => {}) },
  MEMORY_BUCKET: { put: vi.fn(async () => {}) }
} as any;

describe("auth", () => {
  it("auth failure 401", async () => {
    const res = await worker.fetch(new Request("https://x/mcp", { method: "POST", body: "{}" }), env);
    expect(res.status).toBe(401);
  });

  it("admin route admin auth", async () => {
    const res = await worker.fetch(new Request("https://x/admin/export"), env);
    expect(res.status).toBe(401);
  });
});
