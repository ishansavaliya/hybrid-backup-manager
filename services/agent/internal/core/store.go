package core

import (
	"database/sql"
	_ "embed"
	"encoding/json"
	"fmt"
	_ "modernc.org/sqlite"
	"os"
	"path/filepath"
)

//go:embed migrations/001_foundation.sql
var initialSchema string

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
	_, err = s.DB.Exec(`INSERT INTO backup_plans_cache(id,config) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET config=excluded.config`, p.ID, string(b))
	return err
}
func (s *Store) Plans() ([]Plan, error) {
	rows, err := s.DB.Query(`SELECT config FROM backup_plans_cache ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Plan{}
	for rows.Next() {
		var raw string
		var p Plan
		if err = rows.Scan(&raw); err != nil {
			return nil, err
		}
		if err = json.Unmarshal([]byte(raw), &p); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
func (s *Store) Plan(id string) (Plan, error) {
	var raw string
	var p Plan
	err := s.DB.QueryRow(`SELECT config FROM backup_plans_cache WHERE id=?`, id).Scan(&raw)
	if err != nil {
		return p, fmt.Errorf("plan not found: %w", err)
	}
	err = json.Unmarshal([]byte(raw), &p)
	return p, err
}
func (s *Store) Executions() ([]Execution, error) {
	rows, err := s.DB.Query(`SELECT id,plan_id,destination_id,state,snapshot_id,started_at,finished_at,error FROM job_executions ORDER BY started_at DESC LIMIT 200`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Execution{}
	for rows.Next() {
		var e Execution
		if err = rows.Scan(&e.ID, &e.PlanID, &e.DestinationID, &e.State, &e.SnapshotID, &e.StartedAt, &e.FinishedAt, &e.Error); err != nil {
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
	if version > 1 {
		return fmt.Errorf("database schema %d is newer than this agent", version)
	}
	if version == 0 {
		if _, err = tx.Exec(initialSchema); err != nil {
			return err
		}
		if _, err = tx.Exec(`INSERT INTO schema_migrations(version) VALUES(1)`); err != nil {
			return err
		}
	}
	return tx.Commit()
}
