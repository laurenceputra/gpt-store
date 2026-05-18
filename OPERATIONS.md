# Operations Guide

## Backups / export
- Call `GET /admin/export` with admin bearer.
- Output stored in R2 as `exports/memory-export-<timestamp>.jsonl`.

## Reindex
- Call `GET /admin/reindex` with admin bearer.
- Enqueues active memory IDs for async indexing.

## Token rotation
1. Rotate via `wrangler secret put MCP_BEARER_TOKEN` / `ADMIN_BEARER_TOKEN`.
2. Redeploy worker.
3. Update clients.

## Audit logs
- `audit_log` records write/update/archive actions.

## Vector inconsistency recovery
- If D1 and Vectorize diverge, run `/admin/reindex` to rebuild active vectors.
- Archived memories are removed from vectors when supported.

## Adding memory types
1. Update allowed types in `src/types.ts`.
2. Update client usage/docs.
3. Ensure validation/test coverage for any special rule.
