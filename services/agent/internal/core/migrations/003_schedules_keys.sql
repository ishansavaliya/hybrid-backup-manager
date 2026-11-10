CREATE TABLE destination_keys(repository TEXT PRIMARY KEY,sealed BLOB NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE schedule_state(plan_id TEXT PRIMARY KEY,last_due_at TEXT NOT NULL);
 ALTER TABLE job_executions ADD COLUMN notes TEXT NOT NULL DEFAULT '';
