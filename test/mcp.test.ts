import { describe, expect, it, vi } from "vitest";

vi.mock("../src/db/d1", () => ({ incrementUsage: vi.fn(async () => {}) }));
vi.mock("../src/tools/searchMemory", () => ({ searchMemory: vi.fn(async () => ({ records: [] })) }));
vi.mock("../src/tools/getMemory", () => ({
  getMemory: vi.fn(async (args: any) => {
    if (args?.id === "explode") throw new Error("dial tcp 10.0.0.1:5432: connection refused");
    return { found: false };
  })
}));
vi.mock("../src/tools/writeMemory", () => ({ writeMemory: vi.fn(async () => ({ id: "m1" })) }));
vi.mock("../src/tools/updateMemory", () => ({ updateMemoryTool: vi.fn(async () => ({ updated: true })) }));
vi.mock("../src/tools/listRecentMemory", () => ({ listRecentMemory: vi.fn(async () => ({ records: [{ id: "m1" }] })) }));
vi.mock("../src/tools/archiveMemory", () => ({ archiveMemory: vi.fn(async () => ({ success: true })) }));

import { handleMcp } from "../src/mcp";

const env = {
  DB: {} as any,
  INDEX_QUEUE: { send: vi.fn(async () => {}) },
  MEMORY_BUCKET: { put: vi.fn(async () => {}) }
} as any;

const auth = { apiKeyId: "k1", tenantId: "t1", role: "tenant_admin", keyLabel: "admin" } as const;

function mcpRequest(body: string) {
  return new Request("https://x/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body
  });
}

describe("mcp wire protocol", () => {
  it("initialize returns MCP-compatible shape", async () => {
    const res = await handleMcp(
      mcpRequest(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-01-01" } })),
      env,
      auth
    );
    const json = await res.json<any>();
    expect(json.result.protocolVersion).toBe("2025-01-01");
    expect(json.result.capabilities?.tools?.listChanged).toBe(false);
    expect(json.result.serverInfo).toEqual({ name: "memory-mcp", version: "0.1.0" });
  });

  it("tools/list returns six tool schemas", async () => {
    const res = await handleMcp(mcpRequest(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })), env, auth);
    const json = await res.json<any>();
    expect(json.result.tools).toHaveLength(6);
    for (const tool of json.result.tools) {
      expect(typeof tool.name).toBe("string");
      expect(typeof tool.description).toBe("string");
      expect(tool.inputSchema?.type).toBe("object");
      expect(tool.inputSchema?.additionalProperties).toBe(false);
    }

    const byName = Object.fromEntries(json.result.tools.map((t: any) => [t.name, t]));
    expect(byName.search_memory.inputSchema.properties).toHaveProperty("include_archived");
    expect(byName.write_memory.inputSchema.properties.project_key.type).toEqual(["string", "null"]);
    expect(byName.write_memory.inputSchema.properties).toHaveProperty("source");
    expect(byName.write_memory.inputSchema.properties).toHaveProperty("raw_object_key");
    expect(byName.update_memory.inputSchema.properties).toHaveProperty("source");
    expect(byName.update_memory.inputSchema.properties).toHaveProperty("tags");
  });

  it("malformed JSON returns parse error", async () => {
    const res = await handleMcp(mcpRequest("{"), env, auth);
    const json = await res.json<any>();
    expect(json.id).toBeNull();
    expect(json.error.code).toBe(-32700);
  });

  it("tools/call returns MCP-friendly content + structuredContent", async () => {
    const res = await handleMcp(
      mcpRequest(JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_recent_memory", arguments: {} } })),
      env,
      auth
    );
    const json = await res.json<any>();
    expect(Array.isArray(json.result.content)).toBe(true);
    expect(json.result.content[0].type).toBe("text");
    expect(json.result.structuredContent).toEqual({ records: [{ id: "m1" }] });
  });

  it("sanitizes unexpected internal errors", async () => {
    const res = await handleMcp(
      mcpRequest(JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_memory", arguments: { id: "explode" } } })),
      env,
      auth
    );
    const json = await res.json<any>();
    expect(json.error.code).toBe(-32000);
    expect(json.error.message).toBe("Internal error");
  });
});
