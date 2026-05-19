// @ts-expect-error node built-in available in vitest runtime
import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const migrationFiles = [
  "/workspace/gpt-store/migrations/0001_init.sql",
  "/workspace/gpt-store/migrations/0002_tenant_auth_jobs_upgrade.sql"
];

describe("sql schema baseline compatibility", () => {
  it("contains multi-tenant auth, memory, job, and usage baseline", () => {
    const sql = readFileSync("/workspace/gpt-store/src/db/schema.sql", "utf8");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS tenants");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS api_keys");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS jobs");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS usage_daily");
    expect(sql).toContain("lease_expires_at TEXT");
    expect(sql).toContain("INSERT OR IGNORE INTO tenants(id, slug, name, status)");
    expect(sql).toContain("'legacy-import'");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_memories_tenant_project_type ON memories(tenant_id, project_key, memory_type, status)");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_jobs_tenant_status ON jobs(tenant_id, status, created_at DESC)");
  });

  it("keeps runtime schema equal to concatenated migrations", () => {
    const migration = migrationFiles.map((file) => readFileSync(file, "utf8").trim()).join("\n\n");
    const runtime = readFileSync("/workspace/gpt-store/src/db/schema.sql", "utf8").trim();
    expect(runtime).toBe(migration);
  });
});
