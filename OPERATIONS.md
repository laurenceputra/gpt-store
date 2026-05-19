# Operations Guide

## GitHub deploy pipeline

The deploy workflow (`.github/workflows/deploy.yml`) requires repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `BOOTSTRAP_TOKEN`
- `AUTH_PEPPER`

It runs checks (`npm ci`, `npm run typecheck`, `npm test`), syncs `BOOTSTRAP_TOKEN` and `AUTH_PEPPER` to Worker secrets, applies remote D1 migrations, and then deploys the Worker.

## Bootstrap

Create the first operator key once:

```bash
curl -sS -X POST \
  -H "Authorization: Bearer <BOOTSTRAP_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"label":"Initial operator"}' \
  "https://<YOUR_WORKER_DOMAIN>/v1/bootstrap"
```

Bootstrap returns `409 bootstrap_already_completed` after any operator key exists.

If you upgraded from a pre-tenant database, legacy data is imported into tenant slug `legacy-import` (id `tenant_legacy_import`); create scoped keys for that tenant or move data to a new tenant as needed.

## Tenant onboarding

Create a tenant and initial tenant admin key:

```bash
curl -sS -X POST \
  -H "Authorization: Bearer <OPERATOR_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"slug":"acme","name":"Acme","initial_admin_key_label":"Acme admin"}' \
  "https://<YOUR_WORKER_DOMAIN>/v1/platform/tenants"
```

## Key rotation

1. Create a replacement key with `/v1/keys`.
2. Update the client/connector to use the replacement key.
3. Revoke the old key with `/v1/keys/:id/revoke`.
4. Validate old key is rejected and new key succeeds.

## Export

Create a tenant export job:

```bash
curl -sS -X POST \
  -H "Authorization: Bearer <TENANT_ADMIN_API_KEY>" \
  "https://<YOUR_WORKER_DOMAIN>/v1/jobs/export"
```

Poll job status:

```bash
curl -sS -H "Authorization: Bearer <TENANT_ADMIN_API_KEY>" \
  "https://<YOUR_WORKER_DOMAIN>/v1/jobs/<JOB_ID>"
```

Successful exports write JSONL to R2 under `exports/<TENANT_ID>/`.

## Reindex

Create a tenant reindex job:

```bash
curl -sS -X POST \
  -H "Authorization: Bearer <TENANT_ADMIN_API_KEY>" \
  "https://<YOUR_WORKER_DOMAIN>/v1/jobs/reindex"
```

Run after embedding model changes, Vectorize migrations, or queue/indexing incidents.

## Audit logs

`audit_log` includes tenant, API key, actor role, action, memory id, and request summary.

Example D1 query:

```bash
npx wrangler d1 execute <DB_NAME> --remote --command \
  "SELECT created_at, tenant_id, api_key_id, actor_role, action, memory_id FROM audit_log ORDER BY created_at DESC LIMIT 50;"
```

## Usage

`usage_daily` tracks coarse per-tenant counters for cost visibility. Use it to identify high-cost tenants before adding billing or hard quotas.

## Vector inconsistency recovery

1. Verify D1 truth for the affected tenant and memory ids.
2. Trigger `/v1/jobs/reindex` for the tenant.
3. Poll job status until succeeded.
4. Re-run representative searches.
5. If stale archived vectors persist, perform index cleanup/migration and reindex again.
