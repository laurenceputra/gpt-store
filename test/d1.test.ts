import { describe, expect, it } from "vitest";
import { acquireBootstrapGuard, ensureBootstrapStateRow, latestVersionMeta, searchKeyword } from "../src/db/d1";

describe("d1 queries", () => {
  it("latestVersionMeta uses created_at/change_reason columns", async () => {
    let usedSql = "";
    const env = {
      DB: {
        prepare(sql: string) {
          usedSql = sql;
          return {
            bind() {
              return {
                first: async () => null
              };
            }
          };
        }
      }
    } as any;

    await latestVersionMeta(env, "t1", "m1");
    expect(usedSql).toContain("SELECT created_at, change_reason");
    expect(usedSql).toContain("tenant_id = ?");
    expect(usedSql).not.toContain("changed_at");
    expect(usedSql).not.toContain("body");
  });

  it("searchKeyword requires all requested tags", async () => {
    let usedSql = "";
    let usedBind: unknown[] = [];
    const env = {
      DB: {
        prepare(sql: string) {
          usedSql = sql;
          return {
            bind(...args: unknown[]) {
              usedBind = args;
              return {
                all: async () => ({ results: [] })
              };
            }
          };
        }
      }
    } as any;

    await searchKeyword(env, "t1", "hello", false, 8, { tags: ["urgent", "backend"] });
    expect(usedSql).toContain("GROUP BY m.id HAVING COUNT(DISTINCT t.tag) = ?");
    expect(usedBind).toContain(2);
  });

  it("ensureBootstrapStateRow backfills lease_expires_at for evolving schema", async () => {
    const statements: string[] = [];
    const env = {
      DB: {
        prepare(sql: string) {
          statements.push(sql);
          return {
            all: async () => ({ results: [{ name: "id" }, { name: "status" }] }),
            run: async () => ({ meta: { changes: 1 } })
          };
        }
      }
    } as any;

    await ensureBootstrapStateRow(env);
    expect(statements).toContain("PRAGMA table_info(bootstrap_state)");
    expect(statements).toContain("ALTER TABLE bootstrap_state ADD COLUMN lease_expires_at TEXT");
  });

  it("acquireBootstrapGuard can recover stale in_progress lease", async () => {
    let usedSql = "";
    let usedBind: unknown[] = [];
    const env = {
      DB: {
        prepare(sql: string) {
          usedSql = sql;
          return {
            bind(...args: unknown[]) {
              usedBind = args;
              return { run: async () => ({ meta: { changes: 1 } }) };
            }
          };
        }
      }
    } as any;

    const ok = await acquireBootstrapGuard(env);
    expect(ok).toBe(true);
    expect(usedSql).toContain("status = 'pending' OR (status = 'in_progress'");
    expect(usedSql).toContain("lease_expires_at < ?");
    expect(usedBind).toHaveLength(2);
  });
});
