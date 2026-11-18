CREATE TABLE IF NOT EXISTS backup_plans_cache(id TEXT PRIMARY KEY,config TEXT NOT NULL CHECK(json_valid(config)),encrypted INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS job_executions(id TEXT PRIMARY KEY,plan_id TEXT NOT NULL REFERENCES backup_plans_cache(id),destination_id TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('queued','running','succeeded','failed','cancelled','interrupted')),snapshot_id TEXT NOT NULL DEFAULT '',started_at TEXT NOT NULL,finished_at TEXT,error TEXT NOT NULL DEFAULT '',config TEXT NOT NULL CHECK(json_valid(config)));
 CREATE INDEX IF NOT EXISTS jobs_state ON job_executions(state,started_at);
 CREATE TABLE IF NOT EXISTS restore_history(id TEXT PRIMARY KEY,snapshot_id TEXT NOT NULL,target TEXT NOT NULL,state TEXT NOT NULL,created_at TEXT NOT NULL,error TEXT NOT NULL DEFAULT '');
 CREATE TABLE IF NOT EXISTS agent_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS repository_registry(id TEXT PRIMARY KEY,repository TEXT UNIQUE NOT NULL);
 CREATE TABLE IF NOT EXISTS snapshot_cache(repository_id TEXT NOT NULL REFERENCES repository_registry(id),snapshot_id TEXT NOT NULL,metadata TEXT NOT NULL,PRIMARY KEY(repository_id,snapshot_id));
 CREATE TABLE IF NOT EXISTS sync_outbox(id TEXT PRIMARY KEY,payload TEXT NOT NULL,created_at TEXT NOT NULL);
