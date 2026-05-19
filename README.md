# memory-mcp-cloudflare

Multi-tenant MCP external memory server for Cloudflare Workers.

## What this service does

- Stores tenant-scoped memory records in Cloudflare D1.
- Uses bespoke API keys for all customer and operator access.
- Supports MCP memory tools for search, read, write, update, list, and archive.
- Indexes active memories asynchronously into Vectorize for semantic retrieval.
- Tracks audit metadata with tenant, API key, and actor role.
- Runs export and reindex operations as tenant-scoped jobs.

## Architecture

```text
Client / ChatGPT MCP Connector
            |
            v
  Cloudflare Worker (/mcp, /v1/*, /health)
       |             |             |
       |             |             +--> D1 audit_log / jobs / usage_daily
       |             +--> Control plane: tenants, keys, jobs
       |
       +--> D1 source of truth: tenant-scoped memories
       |
       +--> Queue: index and job work
                  |
                  v
           Workers AI embeddings
                  |
                  v
              Vectorize index with tenant_id metadata
```

## Core routes

- `GET /health` public health check
- `POST /v1/bootstrap` first-run operator key creation
- `GET /v1/me` current key identity
- `GET /v1/keys` list visible API keys
- `POST /v1/keys` create API key
- `POST /v1/keys/:id/revoke` revoke API key
- `POST /v1/platform/tenants` operator-only tenant creation
- `POST /v1/jobs/export` create tenant export job
- `POST /v1/jobs/reindex` create tenant reindex job
- `GET /v1/jobs/:id` inspect job status
- `POST /mcp` tenant-scoped MCP endpoint

## Setup prerequisites

- Node.js 20+
- npm
- Cloudflare account with Workers, D1, Queues, R2, Vectorize, and Workers AI enabled
- Wrangler v3

## Cloudflare resources

Create and wire these resources in `wrangler.toml`:

- D1 database bound as `DB`
- Vectorize index bound as `VECTORIZE`
- Queue bound as `INDEX_QUEUE`
- R2 bucket bound as `MEMORY_BUCKET`
- Workers AI binding as `AI`

Apply migrations after replacing placeholders in `wrangler.toml`:

```bash
npm run migrate:local
npm run migrate:remote
```

## Secrets

Set these secrets:

```bash
npx wrangler secret put BOOTSTRAP_TOKEN
npx wrangler secret put AUTH_PEPPER
```

- `BOOTSTRAP_TOKEN` is used only to create the first operator API key.
- `AUTH_PEPPER` is mixed into API key secret hashes. Keep it stable and private.

## GitHub deployment workflow

`.github/workflows/deploy.yml` deploys on `push` to `main` and on manual `workflow_dispatch`.

Required GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `BOOTSTRAP_TOKEN`
- `AUTH_PEPPER`

Before enabling the workflow, replace `wrangler.toml` placeholders (for example `database_id = "<D1_DATABASE_ID>"`) and ensure referenced D1/Vectorize/Queue/R2/AI resources already exist.

Deploy order in CI:

1. `npm ci`
2. `npm run typecheck`
3. `npm test`
4. Sync Worker secrets (`BOOTSTRAP_TOKEN`, `AUTH_PEPPER`)
5. Apply remote D1 migrations
6. Deploy Worker

## First-run bootstrap

After deployment, create the first operator key:

```bash
curl -sS -X POST \
  -H "Authorization: Bearer <BOOTSTRAP_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"label":"Initial operator"}' \
  "https://<YOUR_WORKER_DOMAIN>/v1/bootstrap"
```

The returned API key secret is shown once. Store it securely.

## Create a tenant and initial tenant admin key

```bash
curl -sS -X POST \
  -H "Authorization: Bearer <OPERATOR_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"slug":"acme","name":"Acme","initial_admin_key_label":"Acme admin"}' \
  "https://<YOUR_WORKER_DOMAIN>/v1/platform/tenants"
```

Use the returned tenant admin key to create reader/writer keys through `/v1/keys`.

## MCP auth model

Use a tenant-scoped API key with:

```text
Authorization: Bearer <TENANT_API_KEY>
```

Roles:

- `tenant_reader`: search/list/get memory
- `tenant_writer`: reader permissions plus write/update/archive
- `tenant_admin`: writer permissions plus key and job management
- `operator`: platform tenant/key administration, not accepted for `/mcp`

## Local development

```bash
npm install
npm run typecheck
npm test
npm run dev
```

## Known limitations

- Public signup, browser login, billing, and custom scopes are intentionally out of scope for v1.
- Shared D1/Vectorize infrastructure relies on strict application-level tenant filtering.
- Export and reindex jobs are queue-backed but intentionally simple; add pagination/checkpointing before very large tenant datasets.
