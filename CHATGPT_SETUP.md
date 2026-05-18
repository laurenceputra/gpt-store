# ChatGPT Connector Setup

Use this Worker as an MCP endpoint by exposing the `/mcp` route on your deployed Worker and connecting it from ChatGPT.

## 1) Expose `/mcp` on your Worker

1. Deploy the Worker to Cloudflare:
   - `npx wrangler deploy`
2. Confirm your Worker URL is reachable:
   - `https://<YOUR_WORKER_SUBDOMAIN>.workers.dev/health`
3. Confirm MCP route exists:
   - `https://<YOUR_WORKER_SUBDOMAIN>.workers.dev/mcp`
4. Ensure the MCP auth secret is set in Cloudflare (replace placeholders):
   - `npx wrangler secret put MCP_BEARER_TOKEN`

For production with a custom domain, map your route in `wrangler.toml` and deploy again.

Use these connector values:
- URL: `https://<YOUR_WORKER_DOMAIN>/mcp`
- Header: `Authorization: Bearer <MCP_BEARER_TOKEN>`

## Default project instruction block

```
# External Memory Usage

Use the connected Memory app when the answer depends on prior durable state, project state, portfolio state, trust drafting state, saved decisions, or unresolved open items.

Before answering project-specific questions:

1. Search memory using this project key: `<PROJECT_KEY>`.
2. Prefer project-specific memory over global memory.
3. Separate:
   - executed_state
   - review_state
   - durable_principle
   - open_item
   - next_action
4. Never treat review_state or proposed actions as executed_state.
5. Only write executed_state after I explicitly confirm that the action happened.
6. When updating memory, write a short decision_log explaining what changed and why.
7. Return memory IDs or titles used when they materially affect the answer.
```

## 2) Add MCP connector in ChatGPT Web

1. Open ChatGPT Web and go to **Settings**.
2. Open **Connectors** (or **Apps/Integrations**, depending on UI rollout).
3. Choose **Add connector** and select **MCP**.
4. Enter:
   - **Name**: `Memory MCP` (or your preferred label)
   - **Server URL**: `https://<YOUR_WORKER_DOMAIN>/mcp`
   - **Auth header**: `Authorization`
   - **Auth value**: `Bearer <MCP_BEARER_TOKEN>`
5. Save connector.

> Replace all placeholders (`<...>`) with your real values. Never paste real secrets into docs or source control.

## 3) Test connector from ChatGPT

After saving the connector:

1. Open a new chat.
2. Ask ChatGPT to list connected MCP tools.
3. Verify expected tools are visible (for example create/search/update memory tools).
4. Run a non-destructive read call first (for example a search/list operation).
5. Run one write action in a test project key, then verify read reflects the change.

If tool calls fail:
- Verify token is correct and unexpired.
- Confirm Worker deployment is current (`npx wrangler deploy`).
- Check Worker logs: `npx wrangler tail`
- Check that `/mcp` route is accessible and not blocked by route misconfiguration.

## 4) Use inside a ChatGPT Project

1. Create/open a ChatGPT Project for your codebase.
2. In Project instructions, paste the **Default project instruction block** above.
3. Set a stable `<PROJECT_KEY>` for the project (for example `acme-billing-prod`).
4. Start prompts that depend on project history by asking ChatGPT to first search memory using that key.
5. Require explicit confirmation before writing `executed_state` entries.

## Recommended tool usage
- Initialize MCP session with `initialize`
- Discover tools with `tools/list`
- Use `tools/call` for memory operations
