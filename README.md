# memory-mcp-cloudflare

Production-focused MVP external memory server for MCP on Cloudflare Workers.

## Architecture
- Worker routes: `/health` (public), `/mcp` (MCP bearer), `/admin/export`, `/admin/reindex` (admin bearer)
- D1 as source of truth (`memories`, `memory_tags`, `memory_versions`, `audit_log`)
- Queue-driven async indexing to Vectorize using Workers AI embeddings
- R2 JSONL exports for backup

## Setup
1. Install deps: `npm install`
2. Configure `wrangler.toml` IDs/names.
3. Create secrets:
   - `wrangler secret put MCP_BEARER_TOKEN`
   - `wrangler secret put ADMIN_BEARER_TOKEN`
4. Apply migration:
   - Local: `npm run migrate:local`
   - Remote: `npm run migrate:remote`

## Local dev
- `npm run dev`
- Health check: `GET /health`

## Deploy
- `npm run deploy`

## Security
- No secrets in repo.
- `/mcp` and `/admin/*` strictly bearer-protected.
- Server-side validation enforces memory type/status rules and update guardrails.

## Limitations
- MVP ranking is heuristic.
- Vector delete support depends on Vectorize API availability.
- Queue retries are basic and rely on platform behavior.
