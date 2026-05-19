import { describe, expect, it, vi } from "vitest";

const token = "mmcp_live_pref_secret";

vi.mock("../src/db/d1", () => ({
  getApiKeyByPrefix: vi.fn(async () => ({
    id: "k1",
    tenant_id: null,
    role: "operator",
    label: "op",
    prefix: "pref",
    secret_hash: "ignored",
    status: "active",
    expires_at: "not-a-date",
    last_used_at: null,
    created_by_key_id: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01"
  })),
  getTenantById: vi.fn(async () => null),
  isValidApiKeyRole: vi.fn(() => true),
  markApiKeyUsed: vi.fn(async () => {})
}));

import * as auth from "../src/auth/auth";

describe("auth expiry validation", () => {
  it("fails closed when stored expires_at is malformed", async () => {
    vi.spyOn(auth, "hashTokenSecret").mockResolvedValue("ignored");
    const req = new Request("https://x/v1/me", { headers: { authorization: `Bearer ${token}` } });
    const res = await auth.authenticateRequest(req, { AUTH_PEPPER: "pepper", DB: {} as any } as any);
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(401);
    expect(await (res as Response).json()).toEqual({ error: "key_expired" });
  });
});
