# ChatGPT Connector Setup

Use this Worker as an MCP endpoint by connecting ChatGPT to `/mcp` with a tenant-scoped API key.

## 1) Create a tenant API key

First bootstrap the service and create a tenant/admin key as described in `README.md`.

Then create a writer key for the tenant:

```bash
curl -sS -X POST \
  -H "Authorization: Bearer <TENANT_ADMIN_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"label":"ChatGPT connector","role":"tenant_writer"}' \
  "https://<YOUR_WORKER_DOMAIN>/v1/keys"
```

Store the returned token securely. It is shown once.

## 2) Configure ChatGPT MCP connector

- URL: `https://<YOUR_WORKER_DOMAIN>/mcp`
- Header: `Authorization`
- Auth value: `Bearer <TENANT_WRITER_API_KEY>`

## Default project instruction block

```text
# External Memory Usage

Use the connected Memory app when the answer depends on prior durable state, project state, saved decisions, or unresolved open items.

Before answering project-specific questions:

1. Search memory using this project key: <PROJECT_KEY>.
2. Prefer project-specific memory over tenant-global memory.
3. Separate executed_state, review_state, durable_principle, open_item, and next_action.
4. Never treat review_state or proposed actions as executed_state.
5. Only write executed_state after I explicitly confirm that the action happened.
6. When updating memory, write a short decision_log explaining what changed and why.
7. Return memory IDs or titles used when they materially affect the answer.
```

## Test connector

1. Ask ChatGPT to list connected MCP tools.
2. Run `list_recent_memory` or `search_memory` first.
3. Write one memory in a test namespace/project key.
4. Search for it and confirm it is returned.

If calls fail, verify the API key role, revocation/expiry status, Worker deployment, and logs.
