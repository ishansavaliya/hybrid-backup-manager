package core

import (
	"database/sql"
	_ "embed"
	"encoding/json"
	"fmt"
	_ "modernc.org/sqlite"
	"os"
	"path/filepath"
	"time"
)

//go:embed migrations/001_foundation.sql
var initialSchema string

//go:embed migrations/002_account.sql
var accountSchema string

//go:embed migrations/003_schedules_keys.sql
var scheduleKeysSchema string

//go:embed migrations/004_reports.sql
var reportsSchema string

//go:embed migrations/005_volumes.sql
var volumesSchema string

type Store struct {
	DB   *sql.DB
	Path string
}

func OpenStore(path string) (*Store, error) {
	path, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}
	if err = os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	s := &Store{db, path}
	_, err = db.Exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY);`)
	if err != nil {
		db.Close()
		return nil, err
	}
	if err == nil {
		err = s.migrate()
	}
	if err != nil {
		db.Close()
		return nil, err
	}
	_, _ = db.Exec(`ALTER TABLE backup_plans_cache ADD COLUMN encrypted INTEGER NOT NULL DEFAULT 0`)
	if err = os.Chmod(path, 0600); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}
func (s *Store) SavePlan(p Plan) error {
	b, err := json.Marshal(p)
	if err != nil {
		return err
	}
	enc := 0
	if p.Encrypted {
		enc = 1
	}
	_, err = s.DB.Exec(`INSERT INTO backup_plans_cache(id,config,encrypted) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET config=excluded.config,encrypted=excluded.encrypted`, p.ID, string(b), enc)
	return err
}
func (s *Store) Plans() ([]Plan, error) {
	rows, err := s.DB.Query(`SELECT config, COALESCE(encrypted, 0) FROM backup_plans_cache ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Plan{}
	for rows.Next() {
		var raw string
		var enc int
		var p Plan
		if err = rows.Scan(&raw, &enc); err != nil {
			return nil, err
		}
		if err = json.Unmarshal([]byte(raw), &p); err != nil {
			return nil, err
		}
		p.Encrypted = p.Encrypted || enc != 0 || DefaultEncrypted
		out = append(out, p)
	}
	return out, rows.Err()
}
func (s *Store) Plan(id string) (Plan, error) {
	var raw string
	var enc int
	var p Plan
	err := s.DB.QueryRow(`SELECT config, COALESCE(encrypted, 0) FROM backup_plans_cache WHERE id=?`, id).Scan(&raw, &enc)
	if err != nil {
		return p, fmt.Errorf("plan not found: %w", err)
	}
	err = json.Unmarshal([]byte(raw), &p)
	p.Encrypted = p.Encrypted || enc != 0 || DefaultEncrypted
	return p, err
}
func (s *Store) Executions() ([]Execution, error) {
	rows, err := s.DB.Query(`SELECT id,plan_id,destination_id,state,snapshot_id,started_at,finished_at,error,notes FROM job_executions ORDER BY started_at DESC LIMIT 200`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Execution{}
	for rows.Next() {
		var e Execution
		if err = rows.Scan(&e.ID, &e.PlanID, &e.DestinationID, &e.State, &e.SnapshotID, &e.StartedAt, &e.FinishedAt, &e.Error, &e.Notes); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// Numbered, transactional migrations reject databases created by a newer agent.
func (s *Store) migrate() error {
	tx, err := s.DB.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var version int
	if err = tx.QueryRow(`SELECT COALESCE(MAX(version),0) FROM schema_migrations`).Scan(&version); err != nil {
		return err
	}
	// migrations[i] upgrades the schema from version i to i+1.
	migrations := []string{initialSchema, accountSchema, scheduleKeysSchema, reportsSchema, volumesSchema}
	if version > len(migrations) {
		return fmt.Errorf("database schema %d is newer than this agent", version)
	}
	for v := version; v < len(migrations); v++ {
		if _, err = tx.Exec(migrations[v]); err != nil {
			return fmt.Errorf("schema migration %d: %w", v+1, err)
		}
		if _, err = tx.Exec(`INSERT INTO schema_migrations(version) VALUES(?)`, v+1); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// accountRow is the single account row. Tokens are secrets: never log or return them.
type accountRow struct {
	InstallID    string
	DeviceToken  string
	LicenseToken string
	LastSyncAt   *time.Time
	HighWater    string
}

func formatTime(t time.Time) string { return t.UTC().Format(time.RFC3339Nano) }

func (s *Store) account() (accountRow, error) {
	var r accountRow
	var device, lic, sync sql.NullString
	err := s.DB.QueryRow(`SELECT install_id,device_token,license_token,last_sync_at,high_water FROM account WHERE id=1`).Scan(&r.InstallID, &device, &lic, &sync, &r.HighWater)
	if err != nil {
		return r, fmt.Errorf("account state unavailable: %w", err)
	}
	r.DeviceToken, r.LicenseToken = device.String, lic.String
	if t, err := time.Parse(time.RFC3339Nano, sync.String); sync.Valid && err == nil {
		r.LastSyncAt = &t
	}
	return r, nil
}

// saveSession stores a new device session after a verified sign-in.
func (s *Store) saveSession(token, license string, syncAt, highWater time.Time) error {
	_, err := s.DB.Exec(`UPDATE account SET device_token=?,license_token=?,last_sync_at=?,high_water=? WHERE id=1`, token, license, formatTime(syncAt), formatTime(highWater))
	return err
}

// saveLicense stores a verified refreshed license only if the session that
// requested it is still the current one (a sign-out may have happened meanwhile).
func (s *Store) saveLicense(token, license string, syncAt, highWater time.Time) error {
	_, err := s.DB.Exec(`UPDATE account SET license_token=?,last_sync_at=?,high_water=? WHERE id=1 AND device_token=?`, license, formatTime(syncAt), formatTime(highWater), token)
	return err
}

// clearSession signs out locally. With a token, only that session is cleared.
// Plans, jobs and restore history are never touched.
func (s *Store) clearSession(token string) error {
	q := `UPDATE account SET device_token=NULL,license_token=NULL WHERE id=1`
	args := []any{}
	if token != "" {
		q += ` AND device_token=?`
		args = append(args, token)
	}
	_, err := s.DB.Exec(q, args...)
	return err
}

// advanceHighWater replaces the mark only if it still holds the value that was read,
// so a concurrent successful sync is never overwritten.
func (s *Store) advanceHighWater(previous string, next time.Time) error {
	_, err := s.DB.Exec(`UPDATE account SET high_water=? WHERE id=1 AND high_water=?`, formatTime(next), previous)
	return err
}
