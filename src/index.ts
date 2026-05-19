import { authenticateRequest, jsonError, roleForbidden } from "./auth/auth";
import { handleBootstrap, handleControlRequest } from "./control/control";
import { handleMcp } from "./mcp";
import { handleIndexQueue } from "./queues/indexMemory";
import type { Env } from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "memory-mcp-cloudflare" });
    }
    if (url.pathname === "/v1/bootstrap") {
      return handleBootstrap(request, env);
    }

    if (url.pathname === "/mcp") {
      const auth = await authenticateRequest(request, env);
      if (auth instanceof Response) return auth;
      const forbidden = roleForbidden(auth, ["tenant_reader", "tenant_writer", "tenant_admin"]);
      if (forbidden) return forbidden;
      return handleMcp(request, env, auth);
    }

    if (url.pathname.startsWith("/v1/")) {
      const auth = await authenticateRequest(request, env);
      if (auth instanceof Response) return auth;
      return handleControlRequest(request, env, auth);
    }

    return jsonError(404, "not_found");
  },

  async queue(batch: MessageBatch<any>, env: Env): Promise<void> {
    await handleIndexQueue(batch, env);
  }
};
