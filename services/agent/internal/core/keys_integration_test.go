package core

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func pipe(t *testing.T, a *Agent, method string, params any) Response {
	t.Helper()
	b, err := json.Marshal(params)
	if err != nil {
		t.Fatal(err)
	}
	return a.Handle(context.Background(), Request{Version: 1, Method: method, Params: b})
}

func managedFixture(t *testing.T) (*Agent, Plan) {
	t.Helper()
	a, p := fixture(t)
	p.Destinations[0].PasswordFile = ""
	write(t, filepath.Join(p.Sources[0], "ledger.txt"), "version one")
	if r := pipe(t, a, "savePlan", p); r.Error != nil {
		t.Fatalf("savePlan: %+v", r.Error)
	}
	return a, p
}

func backupOnce(t *testing.T, a *Agent, p Plan) Execution {
	t.Helper()
	if _, err := a.Enqueue(p.ID); err != nil {
		t.Fatal(err)
	}
	if err := a.Work(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	jobs, err := a.Store.Executions()
	if err != nil || len(jobs) == 0 {
		t.Fatalf("executions: %v", err)
	}
	return jobs[0]
}

func TestRealManagedKeyBackupAndRestore(t *testing.T) {
	a, p := managedFixture(t)
	ids := map[string]string{"planId": p.ID, "destinationId": "local"}
	if job := backupOnce(t, a, p); job.State != "failed" || job.Error == "" {
		t.Fatalf("backup before set up should fail: %+v", job)
	}
	if r := pipe(t, a, "initRepository", ids); r.Error != nil {
		t.Fatalf("set up: %+v", r.Error)
	}
	job := backupOnce(t, a, p)
	if job.State != "succeeded" {
		t.Fatalf("managed backup: %+v", job)
	}
	target := filepath.Join(t.TempDir(), "restored")
	r := pipe(t, a, "restore", map[string]string{"planId": p.ID, "destinationId": "local", "snapshotId": job.SnapshotID, "target": target})
	if r.Error != nil {
		t.Fatalf("restore: %+v", r.Error)
	}
	var found bool
	_ = filepath.Walk(target, func(path string, info os.FileInfo, err error) error {
		if err == nil && info.Name() == "ledger.txt" {
			b, _ := os.ReadFile(path)
			found = string(b) == "version one"
		}
		return nil
	})
	if !found {
		t.Fatal("restored file missing")
	}

	// A fresh PC: no stored key. The kit key connects the existing backup.
	key, err := a.withKey(p.Destinations[0], false)
	if err != nil {
		t.Fatal(err)
	}
	if err = a.dropKey(p.Destinations[0]); err != nil {
		t.Fatal(err)
	}
	if r := pipe(t, a, "snapshots", ids); r.Error == nil {
		t.Fatal("snapshots without a key succeeded")
	}
	bad := map[string]string{"planId": p.ID, "destinationId": "local", "key": "definitely-not-the-key"}
	if r := pipe(t, a, "connectDestination", bad); r.Error == nil {
		t.Fatal("wrong key accepted")
	}
	good := map[string]string{"planId": p.ID, "destinationId": "local", "key": " " + key.password + "\n"}
	if r := pipe(t, a, "connectDestination", good); r.Error != nil {
		t.Fatalf("connect with kit key: %+v", r.Error)
	}
	if r := pipe(t, a, "snapshots", ids); r.Error != nil {
		t.Fatalf("snapshots after connect: %+v", r.Error)
	}
}

func TestRealSetUpOverForeignBackupLeavesNoKey(t *testing.T) {
	a, p := managedFixture(t)
	d := p.Destinations[0]
	d.password = "a-different-key-from-another-pc"
	if err := a.Engine.Init(context.Background(), d); err != nil {
		t.Fatal(err)
	}
	if r := pipe(t, a, "initRepository", map[string]string{"planId": p.ID, "destinationId": "local"}); r.Error == nil {
		t.Fatal("set up over an existing backup succeeded")
	}
	if _, err := a.withKey(p.Destinations[0], false); !errors.Is(err, ErrKeyMissing) {
		t.Fatalf("failed set up left a key behind: %v", err)
	}
}

func TestRealRetentionCleansOldVersions(t *testing.T) {
	a, p := managedFixture(t)
	p.Retention = Retention{Enabled: true, Daily: 1}
	if r := pipe(t, a, "savePlan", p); r.Error != nil {
		t.Fatalf("savePlan: %+v", r.Error)
	}
	ids := map[string]string{"planId": p.ID, "destinationId": "local"}
	if r := pipe(t, a, "initRepository", ids); r.Error != nil {
		t.Fatalf("set up: %+v", r.Error)
	}
	backupOnce(t, a, p)
	write(t, filepath.Join(p.Sources[0], "ledger.txt"), "version two")
	job := backupOnce(t, a, p)
	if job.State != "succeeded" || !strings.Contains(job.Notes, "Old versions cleaned up") || !strings.Contains(job.Notes, "Data transferred:") {
		t.Fatalf("second backup: %+v", job)
	}
	d, err := a.withKey(p.Destinations[0], false)
	if err != nil {
		t.Fatal(err)
	}
	snaps, err := a.Engine.Snapshots(context.Background(), d)
	if err != nil || len(snaps) != 1 || snaps[0].ID != job.SnapshotID {
		t.Fatalf("after cleanup: %+v %v", snaps, err)
	}
}

func TestRecoveryKitFileIsPrivate(t *testing.T) {
	a, p := managedFixture(t)
	if r := pipe(t, a, "initRepository", map[string]string{"planId": p.ID, "destinationId": "local"}); r.Error != nil {
		t.Fatalf("set up: %+v", r.Error)
	}
	dir := t.TempDir()
	r := pipe(t, a, "exportRecoveryKit", map[string]string{"directory": dir})
	if r.Error != nil {
		t.Fatalf("export: %+v", r.Error)
	}
	path := r.Result.(map[string]string)["path"]
	info, err := os.Stat(path)
	if err != nil || info.Size() == 0 || (runtime.GOOS != "windows" && info.Mode().Perm() != 0o600) {
		t.Fatalf("kit file: %v %v", info, err)
	}
	if r := pipe(t, a, "exportRecoveryKit", map[string]string{"directory": "relative"}); r.Error == nil {
		t.Fatal("relative folder accepted")
	}
}

func TestRealRunQueuesEmailReport(t *testing.T) {
	a, p := managedFixture(t)
	if r := pipe(t, a, "initRepository", map[string]string{"planId": p.ID, "destinationId": "local"}); r.Error != nil {
		t.Fatalf("set up: %+v", r.Error)
	}
	job := backupOnce(t, a, p)
	reports, err := a.outbox()
	if err != nil || len(reports) != 1 {
		t.Fatalf("outbox: %+v %v", reports, err)
	}
	r := reports[0]
	if r.RunID != job.ID || r.State != "succeeded" || r.PlanName != p.Name || r.DestinationName != "Local" || r.ScheduleKind != "manual" || r.FinishedAt == "" {
		t.Fatalf("report: %+v", r)
	}
}

func TestPlainCopyDefaultAndEncryptedSwitch(t *testing.T) {
	a, p := managedFixture(t)
	var enc int
	if err := a.Store.DB.QueryRow(`SELECT encrypted FROM backup_plans_cache WHERE id=?`, p.ID).Scan(&enc); err != nil || enc != 0 {
		t.Fatalf("default encrypted column should be 0 (false): %d %v", enc, err)
	}
	ids := map[string]string{"planId": p.ID, "destinationId": "local"}
	if r := pipe(t, a, "initRepository", ids); r.Error != nil {
		t.Fatalf("set up: %+v", r.Error)
	}
	// Clicking Set up a second time on an already-initialized destination succeeds idempotently.
	if r := pipe(t, a, "initRepository", ids); r.Error != nil {
		t.Fatalf("idempotent set up: %+v", r.Error)
	}
	job := backupOnce(t, a, p)
	if job.State != "succeeded" {
		t.Fatalf("backup: %+v", job)
	}
	entries, err := os.ReadDir(p.Destinations[0].Repository)
	if err != nil {
		t.Fatalf("read repo: %v", err)
	}
	var bkpDir string
	for _, e := range entries {
		if e.IsDir() && len(e.Name()) >= 4 && e.Name()[:4] == "bkp_" {
			bkpDir = filepath.Join(p.Destinations[0].Repository, e.Name())
			break
		}
	}
	if bkpDir == "" {
		t.Fatalf("expected unique bkp_YYYY-MM-DD_HH-MM-SS folder inside %s", p.Destinations[0].Repository)
	}
	plainFile := filepath.Join(bkpDir, filepath.Base(p.Sources[0]), "ledger.txt")
	b, err := os.ReadFile(plainFile)
	if err != nil || string(b) != "version one" {
		t.Fatalf("plain readable copy missing at %s: %q %v", plainFile, string(b), err)
	}
}

