import { archiveMemory } from "./tools/archiveMemory";
import { incrementUsage } from "./db/d1";
import { getMemory } from "./tools/getMemory";
import { listRecentMemory } from "./tools/listRecentMemory";
import { searchMemory } from "./tools/searchMemory";
import { updateMemoryTool } from "./tools/updateMemory";
import { writeMemory } from "./tools/writeMemory";
import type { AuthContext, Env } from "./types";

const tools: Record<string, (args: any, ctx: { env: Env; auth: AuthContext }) => Promise<any>> = {
  search_memory: searchMemory,
  get_memory: getMemory,
  write_memory: writeMemory,
  update_memory: updateMemoryTool,
  list_recent_memory: listRecentMemory,
  archive_memory: archiveMemory
};

const readTools = new Set(["search_memory", "get_memory", "list_recent_memory"]);
const writeTools = new Set(["write_memory", "update_memory", "archive_memory"]);

const toolDefinitions = [
  {
    name: "search_memory",
    description: "Search memories by semantic and keyword relevance.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1 },
        namespace: { type: "string", minLength: 1 },
        project_key: { type: ["string", "null"] },
        memory_type: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        limit: { type: "integer", minimum: 1, maximum: 20 },
        include_archived: { type: "boolean" }
      },
      required: ["query"],
      additionalProperties: false
    }
  },
  {
    name: "get_memory",
    description: "Get a memory by id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", minLength: 1 }
      },
      required: ["id"],
      additionalProperties: false
    }
  },
  {
    name: "write_memory",
    description: "Create a new memory record.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", minLength: 1 },
        body: { type: "string", minLength: 1, maxLength: 50000 },
        memory_type: { type: "string" },
        namespace: { type: "string", minLength: 1 },
        project_key: { type: ["string", "null"] },
        source: { type: ["string", "null"] },
        raw_object_key: { type: ["string", "null"] },
        tags: { type: "array", items: { type: "string" }, maxItems: 50 },
        confirmed_executed: { type: "boolean" }
      },
      required: ["title", "body", "memory_type", "namespace"],
      additionalProperties: false
    }
  },
  {
    name: "update_memory",
    description: "Update an existing memory record.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", minLength: 1 },
        change_reason: { type: "string", minLength: 1 },
        title: { type: "string", minLength: 1 },
        body: { type: "string", minLength: 1, maxLength: 50000 },
        memory_type: { type: "string" },
        confirmed_executed: { type: "boolean" },
        status: { type: "string" },
        source: { type: "string" },
        tags: { type: "array", items: { type: "string" } }
      },
      required: ["id", "change_reason"],
      additionalProperties: false
    }
  },
  {
    name: "list_recent_memory",
    description: "List most recently updated memories.",
    inputSchema: {
      type: "object",
      properties: {
        namespace: { type: "string", minLength: 1 },
        project_key: { type: ["string", "null"] },
        memory_type: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 20 }
      },
      additionalProperties: false
    }
  },
  {
    name: "archive_memory",
    description: "Archive a memory record by id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", minLength: 1 },
        change_reason: { type: "string", minLength: 1 }
      },
      required: ["id", "change_reason"],
      additionalProperties: false
    }
  }
];

function rpcResult(id: unknown, result: unknown): Response {
  return Response.json({ jsonrpc: "2.0", id, result });
}

function rpcError(id: unknown, code: number, message: string): Response {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } });
}

function isSafeRpcMessage(message: string): boolean {
  return /^[a-z0-9_]+$/.test(message) || message === "query required";
}

export async function handleMcp(req: Request, env: Env, auth: AuthContext): Promise<Response> {
  let requestId: string | number | null = null;
  try {
    const raw = await req.text();
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body) || typeof (body as any).method !== "string") {
      return rpcError(null, -32600, "Invalid Request");
    }

    const id = typeof body.id === "string" || typeof body.id === "number" || body.id === null ? body.id : null;
    requestId = id;

    switch (body?.method) {
      case "initialize":
        return rpcResult(id, {
          protocolVersion: typeof body?.params?.protocolVersion === "string" ? body.params.protocolVersion : "2024-11-05",
          capabilities: {
            tools: {
              listChanged: false
            }
          },
          serverInfo: { name: "memory-mcp", version: "0.1.0" }
        });
      case "ping":
        return rpcResult(id, { pong: true });
      case "tools/list":
        return rpcResult(id, { tools: toolDefinitions });
      case "tools/call": {
        if (!body.params || typeof body.params !== "object" || Array.isArray(body.params) || typeof body.params.name !== "string") {
          return rpcError(id, -32600, "Invalid Request");
        }
        const name = body.params.name;
        const tool = tools[name];
        if (!tool) return rpcError(id, -32601, "Tool not found");
        const args = body.params.arguments ?? {};
        if (typeof args !== "object" || args === null || Array.isArray(args)) {
          return rpcError(id, -32600, "Invalid Request");
        }
        const result = await tool(args, { env, auth });
        if (auth.tenantId && readTools.has(name)) void incrementUsage(env, auth.tenantId, "mcp_reads").catch(() => undefined);
        if (auth.tenantId && writeTools.has(name)) void incrementUsage(env, auth.tenantId, "mcp_writes").catch(() => undefined);
        return rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent: result
        });
      }
      default:
        return rpcError(id, -32601, "Method not found");
    }
  } catch (err) {
    if (err instanceof SyntaxError) {
      return rpcError(null, -32700, "Parse error");
    }
    if (err instanceof Error && isSafeRpcMessage(err.message)) {
      return rpcError(requestId, -32000, err.message);
    }
    return rpcError(requestId, -32000, "Internal error");
  }
}
