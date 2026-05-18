import { describe, expect, it } from "vitest";
import { latestVersionMeta } from "../src/db/d1";

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

    await latestVersionMeta(env, "m1");
    expect(usedSql).toContain("SELECT created_at, change_reason");
    expect(usedSql).not.toContain("changed_at");
    expect(usedSql).not.toContain("body");
  });
});
