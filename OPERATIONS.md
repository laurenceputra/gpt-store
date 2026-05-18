# Operations Guide

## Backups / export

Purpose: produce a D1 snapshot export in JSONL and store it in R2.

1. Trigger export using admin bearer (replace placeholders):
   - `curl -sS -H "Authorization: Bearer <ADMIN_BEARER_TOKEN>" "https://<YOUR_WORKER_DOMAIN>/admin/export"`
2. Confirm generated object in R2 bucket (Wrangler v3):
   - `npx wrangler r2 object list <R2_BUCKET_NAME> --prefix exports/`
3. Download a specific backup file when needed:
   - `npx wrangler r2 object get <R2_BUCKET_NAME>/exports/memory-export-<TIMESTAMP>.jsonl --file ./memory-export-<TIMESTAMP>.jsonl`

Recommended cadence:
- Minimum daily export for active environments.
- Keep immutable dated backups and apply lifecycle retention policy on the bucket.

## Reindex

Purpose: rebuild Vectorize index entries from D1 source-of-truth records.

1. Trigger reindex:
   - `curl -sS -H "Authorization: Bearer <ADMIN_BEARER_TOKEN>" "https://<YOUR_WORKER_DOMAIN>/admin/reindex"`
2. Confirm queue/worker processing via logs:
   - `npx wrangler tail`
3. Validate by running representative semantic search queries through MCP.

When to run:
- After embedding model changes.
- After index schema/dimension migration.
- After incidents causing queue consumer failure.

## Token rotation

1. Rotate MCP token:
   - `npx wrangler secret put MCP_BEARER_TOKEN`
2. Rotate admin token:
   - `npx wrangler secret put ADMIN_BEARER_TOKEN`
3. Deploy updated secrets:
   - `npx wrangler deploy`
4. Update all clients/connectors to use new values.
5. Validate old tokens are rejected and new tokens succeed.

Notes:
- Never store real tokens in docs, code, tickets, or chat logs.
- Prefer emergency rotation immediately after suspected leakage.

## Audit logs

`audit_log` records write/update/archive style operations.

Inspection examples:

- Local D1 (if configured):
  - `npx wrangler d1 execute <DB_NAME> --local --command "SELECT created_at, actor, action, memory_id FROM audit_log ORDER BY created_at DESC LIMIT 50;"`
- Remote D1:
  - `npx wrangler d1 execute <DB_NAME> --remote --command "SELECT created_at, actor, action, memory_id FROM audit_log ORDER BY created_at DESC LIMIT 50;"`
- Filter by memory id:
  - `npx wrangler d1 execute <DB_NAME> --remote --command "SELECT created_at, actor, action, request_summary FROM audit_log WHERE memory_id = '<MEMORY_ID>' ORDER BY created_at DESC;"`

## Vector inconsistency recovery

Symptoms:
- D1 record exists but semantic retrieval misses it.
- Search returns stale/archived content.

Recovery playbook:

1. Verify D1 truth for affected IDs.
2. Trigger `/admin/reindex` to rebuild active vectors.
3. Re-run representative retrieval queries.
4. If stale vectors persist, perform index-level cleanup/migration strategy, then reindex.
5. Record incident details and remediation in operational notes.

Important:
- Treat D1 as source of truth.
- Do not delete D1 records to “fix” Vectorize drift.

## Adding memory types

Add new memory types safely with a compatibility-first rollout:

1. Define the new type and its semantics in code-level validation.
2. Ensure separation rules remain explicit (for example executed state vs review/proposed state).
3. Update MCP tool schemas and client-facing docs.
4. Add migration/compatibility handling for existing records if needed.
5. Deploy behind operational caution (small controlled rollout first).
6. Verify audit_log captures the new type’s write/update lifecycle.
7. Reindex if retrieval behavior depends on changed indexing metadata.

Guardrails:
- Never reinterpret existing stored types silently.
- Prefer additive rollout over in-place semantic breaking changes.
