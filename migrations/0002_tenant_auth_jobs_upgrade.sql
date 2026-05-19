PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO tenants(id, slug, name, status)
VALUES ('tenant_legacy_import', 'legacy-import', 'Legacy Import', 'active');

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  role TEXT NOT NULL,
  label TEXT NOT NULL,
  prefix TEXT NOT NULL UNIQUE,
  secret_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TEXT,
  last_used_at TEXT,
  created_by_key_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by_key_id) REFERENCES api_keys(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant_role ON api_keys(tenant_id, role, status);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(prefix);

CREATE TABLE IF NOT EXISTS bootstrap_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  status TEXT NOT NULL DEFAULT 'pending',
  completed_at TEXT,
  key_id TEXT,
  lease_expires_at TEXT,
  FOREIGN KEY(key_id) REFERENCES api_keys(id) ON DELETE SET NULL
);

INSERT OR IGNORE INTO bootstrap_state(id, status, completed_at, key_id, lease_expires_at)
VALUES (1, 'pending', NULL, NULL, NULL);

CREATE TABLE memories_new (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  namespace TEXT NOT NULL,
  project_key TEXT,
  memory_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT,
  raw_object_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

INSERT INTO memories_new(id, tenant_id, namespace, project_key, memory_type, title, body, status, source, raw_object_key, created_at, updated_at)
SELECT id, 'tenant_legacy_import', namespace, project_key, memory_type, title, body, status, source, raw_object_key, created_at, updated_at
FROM memories;

DROP TABLE memories;
ALTER TABLE memories_new RENAME TO memories;

CREATE INDEX IF NOT EXISTS idx_memories_tenant_project_type ON memories(tenant_id, project_key, memory_type, status);
CREATE INDEX IF NOT EXISTS idx_memories_tenant_namespace ON memories(tenant_id, namespace, status);
CREATE INDEX IF NOT EXISTS idx_memories_tenant_updated ON memories(tenant_id, updated_at DESC);

CREATE TABLE memory_tags_new (
  tenant_id TEXT NOT NULL,
  memory_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY(tenant_id, memory_id, tag),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(memory_id) REFERENCES memories(id) ON DELETE CASCADE
);

INSERT INTO memory_tags_new(tenant_id, memory_id, tag)
SELECT 'tenant_legacy_import', memory_id, tag
FROM memory_tags;

DROP TABLE memory_tags;
ALTER TABLE memory_tags_new RENAME TO memory_tags;

CREATE INDEX IF NOT EXISTS idx_memory_tags_tenant_tag ON memory_tags(tenant_id, tag);

CREATE TABLE memory_versions_new (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  memory_id TEXT NOT NULL,
  previous_body TEXT,
  new_body TEXT NOT NULL,
  changed_by TEXT,
  change_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(memory_id) REFERENCES memories(id) ON DELETE CASCADE
);

INSERT INTO memory_versions_new(id, tenant_id, memory_id, previous_body, new_body, changed_by, change_reason, created_at)
SELECT id, 'tenant_legacy_import', memory_id, previous_body, new_body, changed_by, change_reason, created_at
FROM memory_versions;

DROP TABLE memory_versions;
ALTER TABLE memory_versions_new RENAME TO memory_versions;

CREATE INDEX IF NOT EXISTS idx_memory_versions_tenant_memory_id ON memory_versions(tenant_id, memory_id, created_at DESC);

CREATE TABLE audit_log_new (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  api_key_id TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  memory_id TEXT,
  tool_name TEXT,
  request_summary TEXT,
  actor TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE SET NULL,
  FOREIGN KEY(api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL
);

INSERT INTO audit_log_new(id, tenant_id, api_key_id, actor_role, action, memory_id, tool_name, request_summary, actor, created_at)
SELECT id, 'tenant_legacy_import', NULL, 'legacy_import', action, memory_id, tool_name, request_summary, actor, created_at
FROM audit_log;

DROP TABLE audit_log;
ALTER TABLE audit_log_new RENAME TO audit_log;

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_memory_id ON audit_log(tenant_id, memory_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_api_key_id ON audit_log(api_key_id, created_at DESC);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  requested_by_key_id TEXT,
  cursor TEXT,
  result_object_key TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  finished_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(requested_by_key_id) REFERENCES api_keys(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_tenant_status ON jobs(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_requested_by ON jobs(requested_by_key_id, created_at DESC);

CREATE TABLE IF NOT EXISTS usage_daily (
  tenant_id TEXT NOT NULL,
  day TEXT NOT NULL,
  mcp_reads INTEGER NOT NULL DEFAULT 0,
  mcp_writes INTEGER NOT NULL DEFAULT 0,
  job_submissions INTEGER NOT NULL DEFAULT 0,
  embedding_requests INTEGER NOT NULL DEFAULT 0,
  vector_queries INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(tenant_id, day),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

PRAGMA foreign_keys = ON;
