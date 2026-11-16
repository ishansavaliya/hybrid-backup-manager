CREATE TABLE account(id INTEGER PRIMARY KEY CHECK (id = 1),install_id TEXT NOT NULL,device_token TEXT,license_token TEXT,last_sync_at TEXT,high_water TEXT NOT NULL);
 INSERT INTO account(id,install_id,high_water) VALUES(1,lower(hex(randomblob(16))),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
