package core

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestRealExpiredClientRestoresOnNewPC(t *testing.T) {
	// Old PC: a normal managed-key backup.
	old, p := managedFixture(t)
	if r := pipe(t, old, "initRepository", map[string]string{"planId": p.ID, "destinationId": "local"}); r.Error != nil {
		t.Fatalf("set up: %+v", r.Error)
	}
	job := backupOnce(t, old, p)
	if job.State != "succeeded" {
		t.Fatalf("old backup: %+v", job)
	}
	kitKey, err := old.withKey(p.Destinations[0], false)
	if err != nil {
		t.Fatal(err)
	}

	// New PC, membership expired: restore-only.
	root := t.TempDir()
	store, err := OpenStore(filepath.Join(root, "state", "agent.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.DB.Close() })
	clock := newTestClock(time.Now())
	b, fake := accountAgent(t, store, old.Engine, clock.Now)
	fake.mode, fake.bodyMode = "restore_only", "restore_only"
	if _, err = b.SignIn(context.Background(), "password", "acme", "pw", ""); err != nil {
		t.Fatal(err)
	}
	if r := pipe(t, b, "savePlan", p); r.Error == nil {
		t.Fatal("normal plan created while restore-only")
	}

	parent := filepath.Dir(p.Destinations[0].Repository)
	bad := map[string]string{"name": "Old PC", "repository": parent, "key": "wrong-key-123456"}
	if r := pipe(t, b, "openExistingBackup", bad); r.Error == nil {
		t.Fatal("wrong key accepted")
	}
	if r := pipe(t, b, "openExistingBackup", map[string]string{"name": "Old PC", "repository": root, "key": kitKey.password}); r.Error == nil {
		t.Fatal("folder without a backup accepted")
	}
	// Open the repository folder itself.
	r := pipe(t, b, "openExistingBackup", map[string]string{"name": "Old PC", "repository": p.Destinations[0].Repository, "key": kitKey.password})
	if r.Error != nil {
		t.Fatalf("open: %+v", r.Error)
	}
	opened := r.Result.(Plan)
	if !opened.RestoreOnly || len(opened.Sources) != 0 {
		t.Fatalf("opened plan: %+v", opened)
	}
	if r := pipe(t, b, "openExistingBackup", map[string]string{"name": "Again", "repository": p.Destinations[0].Repository, "key": kitKey.password}); r.Error == nil {
		t.Fatal("same backup opened twice")
	}

	ids := map[string]string{"planId": opened.ID, "destinationId": "backup"}
	if r := pipe(t, b, "snapshots", ids); r.Error != nil {
		t.Fatalf("snapshots: %+v", r.Error)
	}
	target := filepath.Join(t.TempDir(), "restored")
	if r := pipe(t, b, "restore", map[string]string{"planId": opened.ID, "destinationId": "backup", "snapshotId": job.SnapshotID, "target": target}); r.Error != nil {
		t.Fatalf("restore: %+v", r.Error)
	}
	found := false
	_ = filepath.Walk(target, func(path string, info os.FileInfo, err error) error {
		found = found || (err == nil && info.Name() == "ledger.txt")
		return nil
	})
	if !found {
		t.Fatal("restored file missing")
	}

	// Never a backup target, never editable, never scheduled.
	if _, err = b.Enqueue(opened.ID); !errors.Is(err, ErrRestoreOnlyPlan) {
		t.Fatalf("enqueue: %v", err)
	}
	fake.mode, fake.bodyMode = "full", "full"
	if err = b.Refresh(context.Background()); err != nil {
		t.Fatal(err)
	}
	edited := opened
	edited.Schedule = Schedule{Kind: "hourly"}
	edited.RestoreOnly = false
	if r := pipe(t, b, "savePlan", edited); r.Error == nil {
		t.Fatal("restore-only plan edited")
	}
	clock.Add(3 * time.Hour)
	if q, _ := b.SchedulerTick(); len(q) != 0 {
		t.Fatalf("scheduled: %v", q)
	}
}

func TestRealDeletePlanKeepsBackupAndKey(t *testing.T) {
	a, p := managedFixture(t)
	ids := map[string]string{"planId": p.ID, "destinationId": "local"}
	if r := pipe(t, a, "initRepository", ids); r.Error != nil {
		t.Fatalf("set up: %+v", r.Error)
	}
	job := backupOnce(t, a, p)
	key, err := a.withKey(p.Destinations[0], false)
	if err != nil {
		t.Fatal(err)
	}
	// Not while a backup of it is queued.
	if _, err = a.Enqueue(p.ID); err != nil {
		t.Fatal(err)
	}
	if r := pipe(t, a, "deletePlan", map[string]string{"planId": p.ID}); r.Error == nil {
		t.Fatal("deleted while queued")
	}
	if err = a.Work(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	if r := pipe(t, a, "deletePlan", map[string]string{"planId": p.ID}); r.Error != nil {
		t.Fatalf("delete: %+v", r.Error)
	}
	if plans, _ := a.Store.Plans(); len(plans) != 0 {
		t.Fatalf("plan still there: %+v", plans)
	}
	if jobs, _ := a.Store.Executions(); len(jobs) != 0 {
		t.Fatalf("history of the deleted plan kept: %d", len(jobs))
	}
	// The kit still has the key, and the backup opens again with it.
	kit, err := a.RecoveryKit()
	if err != nil || !containsAll(kit, "(deleted plan)", key.password) {
		t.Fatalf("kit: %v", err)
	}
	r := pipe(t, a, "openExistingBackup", map[string]string{"name": "Old", "repository": p.Destinations[0].Repository, "key": key.password})
	if r.Error != nil {
		t.Fatalf("reopen: %+v", r.Error)
	}
	if r := pipe(t, a, "snapshots", map[string]string{"planId": r.Result.(Plan).ID, "destinationId": "backup"}); r.Error != nil {
		t.Fatalf("snapshots: %+v", r.Error)
	}
	_ = job
	if r := pipe(t, a, "deletePlan", map[string]string{"planId": "missing"}); r.Error == nil {
		t.Fatal("deleted a missing plan")
	}
}
