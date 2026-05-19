import { describe, expect, it, vi } from "vitest";
import { generateApiToken, hashTokenSecret, parseApiToken } from "../src/auth/auth";
import worker from "../src/index";

const env = {
  BOOTSTRAP_TOKEN: "bootstrap",
  AUTH_PEPPER: "pepper",
  DB: {} as any,
  INDEX_QUEUE: { send: vi.fn(async () => {}) },
  MEMORY_BUCKET: { put: vi.fn(async () => {}) }
} as any;

describe("bespoke auth", () => {
  it("rejects unauthenticated MCP requests", async () => {
    const res = await worker.fetch(new Request("https://x/mcp", { method: "POST", body: "{}" }), env);
    expect(res.status).toBe(401);
  });

  it("parses generated API tokens", () => {
    const generated = generateApiToken("live");
    const parsed = parseApiToken(generated.token);
    expect(parsed?.environment).toBe("live");
    expect(parsed?.prefix).toBe(generated.prefix);
    expect(parsed?.secret).toBe(generated.secret);
  });

  it("hashes token secrets with prefix and pepper", async () => {
    const a = await hashTokenSecret("p1", "secret", "pepper");
    const b = await hashTokenSecret("p1", "secret", "pepper");
    const c = await hashTokenSecret("p2", "secret", "pepper");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
