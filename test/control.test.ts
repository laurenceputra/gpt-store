import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, enqueueJobMock } = vi.hoisted(() => ({
  state: {
    operatorCount: 0,
    guardAcquireOk: true,
    createdKeyId: 0,
    revoked: "",
    tenant: { id: "t1", slug: "acme", name: "Acme", status: "active", created_at: "2026-01-01", updated_at: "2026-01-01" }
  },
  enqueueJobMock: vi.fn(async () => {})
}));

vi.mock("../src/db/d1", () => ({
  countOperatorKeys: vi.fn(async () => state.operatorCount),
  ensureBootstrapStateRow: vi.fn(async () => {}),
  acquireBootstrapGuard: vi.fn(async () => state.guardAcquireOk),
  completeBootstrapGuard: vi.fn(async () => {}),
  releaseBootstrapGuard: vi.fn(async () => {}),
  createApiKeyRecord: vi.fn(async (_env: any, input: any) => ({
    id: `k${++state.createdKeyId}`,
    tenant_id: input.tenant_id,
    role: input.role,
    label: input.label,
    prefix: input.prefix,
    secret_hash: input.secret_hash,
    status: "active",
    expires_at: input.expires_at ?? null,
    last_used_at: null,
    created_by_key_id: input.created_by_key_id ?? null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01"
  })),
  createTenant: vi.fn(async (_env: any, input: any) => ({ ...state.tenant, slug: input.slug, name: input.name })),
  getTenantById: vi.fn(async (_env: any, id: string) => (id === "t1" ? state.tenant : null)),
  isValidApiKeyRole: (role: string) => ["operator", "tenant_admin", "tenant_writer", "tenant_reader"].includes(role),
  isValidJobType: (type: string) => ["export", "reindex"].includes(type),
  listApiKeys: vi.fn(async () => []),
  getApiKeyById: vi.fn(async (_env: any, id: string) => ({
    id,
    tenant_id: "t1",
    role: "tenant_writer",
    label: "Writer",
    prefix: "p",
    secret_hash: "h",
    status: "active",
    expires_at: null,
    last_used_at: null,
    created_by_key_id: "admin",
    created_at: "2026-01-01",
    updated_at: "2026-01-01"
  })),
  revokeApiKey: vi.fn(async (_env: any, id: string) => {
    state.revoked = id;
  }),
  createJob: vi.fn(async (_env: any, input: any) => ({
    id: "job1",
    tenant_id: input.tenant_id,
    type: input.type,
    status: "queued",
    requested_by_key_id: input.requested_by_key_id,
    cursor: null,
    result_object_key: null,
    error: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    started_at: null,
    finished_at: null
  })),
  getJobById: vi.fn(async (_env: any, id: string) => ({
    id,
    tenant_id: "t1",
    type: "export",
    status: "queued",
    requested_by_key_id: "admin",
    cursor: null,
    result_object_key: null,
    error: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    started_at: null,
    finished_at: null
  }))
}));

vi.mock("../src/jobs/jobs", () => ({ enqueueJob: enqueueJobMock }));

import { handleBootstrap, handleControlRequest } from "../src/control/control";

const env = { BOOTSTRAP_TOKEN: "boot", AUTH_PEPPER: "pepper", DB: {} as any, INDEX_QUEUE: { send: vi.fn() }, MEMORY_BUCKET: {} } as any;
const operator = { apiKeyId: "op", tenantId: null, role: "operator", keyLabel: "operator" } as const;
const tenantAdmin = { apiKeyId: "admin", tenantId: "t1", role: "tenant_admin", keyLabel: "admin" } as const;
const tenantWriter = { apiKeyId: "writer", tenantId: "t1", role: "tenant_writer", keyLabel: "writer" } as const;

function jsonRequest(path: string, body?: unknown) {
  return new Request(`https://x${path}`, {
    method: "POST",
    headers: { authorization: "Bearer boot", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

describe("control plane", () => {
  beforeEach(() => {
    state.operatorCount = 0;
    state.guardAcquireOk = true;
    state.createdKeyId = 0;
    state.revoked = "";
    enqueueJobMock.mockClear();
  });

  it("bootstraps first operator key once", async () => {
    const res = await handleBootstrap(jsonRequest("/v1/bootstrap", { label: "Ops" }), env);
    const body = await res.json<any>();
    expect(res.status).toBe(201);
    expect(body.key.role).toBe("operator");
    expect(body.token).toMatch(/^mmcp_live_/);
  });

  it("blocks bootstrap after operator key exists", async () => {
    state.operatorCount = 1;
    const res = await handleBootstrap(jsonRequest("/v1/bootstrap", { label: "Ops" }), env);
    expect(res.status).toBe(409);
  });

  it("blocks conflicting bootstrap attempts with atomic guard", async () => {
    state.guardAcquireOk = false;
    const res = await handleBootstrap(jsonRequest("/v1/bootstrap", { label: "Ops" }), env);
    const body = await res.json<any>();
    expect(res.status).toBe(409);
    expect(body.error).toBe("bootstrap_already_completed");
  });

  it("allows operator tenant creation with initial admin key", async () => {
    const res = await handleControlRequest(jsonRequest("/v1/platform/tenants", { slug: "acme", name: "Acme", initial_admin_key_label: "Admin" }), env, operator);
    const body = await res.json<any>();
    expect(res.status).toBe(201);
    expect(body.tenant.slug).toBe("acme");
    expect(body.initial_admin_key.role).toBe("tenant_admin");
  });

  it("allows tenant admin to create tenant writer key", async () => {
    const res = await handleControlRequest(jsonRequest("/v1/keys", { label: "Writer", role: "tenant_writer" }), env, tenantAdmin);
    const body = await res.json<any>();
    expect(res.status).toBe(201);
    expect(body.key.tenant_id).toBe("t1");
    expect(body.key.role).toBe("tenant_writer");
  });

  it("canonicalizes expires_at on key creation", async () => {
    const res = await handleControlRequest(jsonRequest("/v1/keys", { label: "Writer", role: "tenant_writer", expires_at: "2027-06-01" }), env, tenantAdmin);
    const body = await res.json<any>();
    expect(res.status).toBe(201);
    expect(body.key.expires_at).toBe("2027-06-01T00:00:00.000Z");
  });

  it("rejects invalid expires_at", async () => {
    const res = await handleControlRequest(jsonRequest("/v1/keys", { label: "Writer", role: "tenant_writer", expires_at: "not-a-date" }), env, tenantAdmin);
    const body = await res.json<any>();
    expect(res.status).toBe(400);
    expect(body.error).toBe("invalid_expires_at");
  });

  it("rejects already expired expires_at", async () => {
    const res = await handleControlRequest(
      jsonRequest("/v1/keys", { label: "Writer", role: "tenant_writer", expires_at: "2001-01-01T00:00:00.000Z" }),
      env,
      tenantAdmin
    );
    const body = await res.json<any>();
    expect(res.status).toBe(400);
    expect(body.error).toBe("invalid_expires_at");
  });

  it("forbids writers from creating jobs", async () => {
    const res = await handleControlRequest(jsonRequest("/v1/jobs/export"), env, tenantWriter);
    expect(res.status).toBe(403);
  });
});
