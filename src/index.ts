import { exportMemory } from "./admin/exportMemory";
import { reindexMemory } from "./admin/reindexMemory";
import { requireToken } from "./auth/auth";
import { handleMcp } from "./mcp";
import { handleIndexQueue } from "./queues/indexMemory";
import type { Env } from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "memory-mcp-cloudflare" });
    }
    if (url.pathname === "/mcp") {
      const auth = requireToken(request, env.MCP_BEARER_TOKEN);
      if (auth) return auth;
      return handleMcp(request, env);
    }
    if (url.pathname === "/admin/export") {
      const auth = requireToken(request, env.ADMIN_BEARER_TOKEN);
      if (auth) return auth;
      return Response.json(await exportMemory(env));
    }
    if (url.pathname === "/admin/reindex") {
      const auth = requireToken(request, env.ADMIN_BEARER_TOKEN);
      if (auth) return auth;
      return Response.json(await reindexMemory(env));
    }
    return new Response("Not Found", { status: 404 });
  },

  async queue(batch: MessageBatch<any>, env: Env): Promise<void> {
    await handleIndexQueue(batch, env);
  }
};
