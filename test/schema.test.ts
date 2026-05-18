// @ts-expect-error node built-in available in vitest runtime
import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const files = ["/workspace/gpt-store/migrations/0001_init.sql", "/workspace/gpt-store/src/db/schema.sql"];

describe("sql schema baseline compatibility", () => {
  it("contains baseline columns and indexes", () => {
    for (const file of files) {
      const sql = readFileSync(file, "utf8");
      expect(sql).toContain("project_key TEXT");
      expect(sql).toContain("raw_object_key TEXT");
      expect(sql).toContain("previous_body TEXT");
      expect(sql).toContain("new_body TEXT NOT NULL");
      expect(sql).toContain("request_summary TEXT");
      expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_memories_project_type ON memories(project_key, memory_type, status)");
      expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_memories_namespace ON memories(namespace, status)");
      expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_memories_updated ON memories(updated_at)");
    }
  });
});
