# memory-mcp-cloudflare

Production-focused MVP external memory server for MCP on Cloudflare Workers.

## What this service does

This service provides an MCP-compatible external memory backend for agents and ChatGPT projects.

- Stores canonical memory records in Cloudflare D1.
- Supports typed memory states (for example executed vs review/proposed state).
- Performs asynchronous semantic indexing into Vectorize for retrieval.
- Maintains audit trails and versioning metadata.
- Exposes admin endpoints for export and reindex operations.

## Architecture

Text diagram:

```text
Client / ChatGPT MCP Connector
            |
            v
  Cloudflare Worker (/mcp, /admin/*, /health)
      |              |                 |
      |              |                 +--> Audit/event logs (D1 audit_log)
      |              +--> Admin tasks (export/reindex)
      |
      +--> D1 (source of truth: memories, tags, versions)
      |
      +--> Queue (index jobs)
                 |
                 v
          Workers AI embeddings
                 |
                 v
             Vectorize index

Admin export path:
Worker /admin/export -> D1 scan -> JSONL -> R2 object storage
```

Core routes:
- `GET /health` (public health check)
- `POST /mcp` (MCP endpoint, bearer protected)
- `GET /admin/export` (admin bearer)
- `GET /admin/reindex` (admin bearer)

## Setup prerequisites

- Node.js 20+ (recommended current LTS)
- npm (or project package manager)
- Cloudflare account with Workers, D1, Queues, R2, Vectorize enabled
- Wrangler v3 (`npx wrangler --version`)

> Commands below use placeholders like `<ACCOUNT_ID>`, `<DB_NAME>`, and `<INDEX_NAME>`. Replace them before running.

## Create Cloudflare resources (Wrangler v3)

### 1) D1 database

- Create:
  - `npx wrangler d1 create <DB_NAME>`
- Apply local/remote migrations after wiring IDs in `wrangler.toml`:
  - `npm run migrate:local`
  - `npm run migrate:remote`

### 2) Vectorize index

Use dimensions for `bge-base-en-v1.5` embeddings (768):

- `npx wrangler vectorize create <INDEX_NAME> --dimensions=768 --metric=cosine`

### 3) R2 bucket

- `npx wrangler r2 bucket create <R2_BUCKET_NAME>`

### 4) Queue (index pipeline)

- `npx wrangler queues create <QUEUE_NAME>`

After creation, update `wrangler.toml` bindings (D1 DB id, Vectorize index, R2 bucket, Queue producer/consumer).

## Initial setup

1. Install dependencies:
   - `npm install`
2. Configure `wrangler.toml` with the created resource names/IDs.
3. Set secrets (never commit secrets):
   - `npx wrangler secret put MCP_BEARER_TOKEN`
   - `npx wrangler secret put ADMIN_BEARER_TOKEN`
4. Run migrations:
   - `npm run migrate:local`
   - `npm run migrate:remote`

## Local development

- Start local dev server:
  - `npm run dev`
- Health check:
  - `curl -i http://127.0.0.1:8787/health`
- Stream logs during local sessions:
  - `npx wrangler tail`

## Deployment

- Deploy Worker:
  - `npm run deploy`
- Verify production health:
  - `curl -i "https://<YOUR_WORKER_DOMAIN>/health"`

## Security model

- `/mcp` and `/admin/*` require bearer auth.
- D1 is the authoritative store; Vectorize is a derived index.
- Writes are validated server-side for memory type/state rules.
- Audit log captures write/update/archive style operations.
- Secrets are stored via Wrangler secrets, not repository files.
- Admin token should be scoped operationally and rotated regularly.

## Known limitations

- Retrieval/ranking remains MVP-level heuristic quality.
- Vector deletion behavior can depend on current Vectorize API capabilities.
- Queue retry/backoff behavior primarily relies on platform defaults unless explicitly tuned.
- Reindex/export are admin-triggered operations (not fully autonomous workflows).
- Cross-region consistency and very high-volume throughput tuning are out of scope for this MVP.
