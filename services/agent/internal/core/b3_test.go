package core

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type fakeVolumes struct {
	byRoot map[string]VolumeInfo
}

func (f *fakeVolumes) Info(path string) (VolumeInfo, error) {
	for root, v := range f.byRoot {
		if path == strings.TrimSuffix(root, string(filepath.Separator)) || strings.HasPrefix(path, root) {
			v.Root = root
			return v, nil
		}
	}
	return VolumeInfo{}, os.ErrNotExist
}
func (f *fakeVolumes) Roots() []string {
	out := []string{}
	for r := range f.byRoot {
		out = append(out, r)
	}
	return out
}

func useVolumes(t *testing.T, v volumeOps) {
	t.Helper()
	old := volumes
	volumes = v
	t.Cleanup(func() { volumes = old })
}

func lastJob(t *testing.T, a *Agent) Execution {
	t.Helper()
	jobs, err := a.Store.Executions()
	if err != nil || len(jobs) == 0 {
		t.Fatalf("executions: %v", err)
	}
	return jobs[0]
}

func TestRealShadowCopyFallsBackWhenUnavailable(t *testing.T) {
	a, p := managedFixture(t)
	a.Engine.FSSnapshot = true // restic off Windows rejects --use-fs-snapshot
	if r := pipe(t, a, "initRepository", map[string]string{"planId": p.ID, "destinationId": "local"}); r.Error != nil {
		t.Fatalf("set up: %+v", r.Error)
	}
	job := backupOnce(t, a, p)
	if job.State != "succeeded" || !strings.Contains(job.Notes, WarnNoShadowCopy) {
		t.Fatalf("fallback: %+v", job)
	}
}

func TestRealUnreadableFileKeepsSnapshotAndSkipsCleanup(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("root can read every file")
	}
	a, p := managedFixture(t)
	p.Retention = Retention{Enabled: true, Daily: 1}
	if r := pipe(t, a, "savePlan", p); r.Error != nil {
		t.Fatalf("savePlan: %+v", r.Error)
	}
	if r := pipe(t, a, "initRepository", map[string]string{"planId": p.ID, "destinationId": "local"}); r.Error != nil {
		t.Fatalf("set up: %+v", r.Error)
	}
	backupOnce(t, a, p)
	locked := filepath.Join(p.Sources[0], "locked.dat")
	write(t, locked, "in use")
	if err := os.Chmod(locked, 0); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(locked, 0o600) })
	job := backupOnce(t, a, p)
	if job.State != "succeeded" || job.SnapshotID == "" {
		t.Fatalf("partial backup should succeed: %+v", job)
	}
	if !strings.Contains(job.Notes, WarnUnreadable) || !strings.Contains(job.Notes, "Cleanup skipped: some files could not be read") {
		t.Fatalf("notes: %q", job.Notes)
	}
	d, err := a.withKey(p.Destinations[0], false)
	if err != nil {
		t.Fatal(err)
	}
	snaps, err := a.Engine.Snapshots(context.Background(), d)
	if err != nil || len(snaps) != 2 {
		t.Fatalf("complete older snapshot must be kept: %d %v", len(snaps), err)
	}
}

func TestRealDiskWithNewDriveLetterIsFound(t *testing.T) {
	a, p := managedFixture(t)
	disks := t.TempDir()
	oldRoot := filepath.Join(disks, "E") + string(filepath.Separator)
	newRoot := filepath.Join(disks, "F") + string(filepath.Separator)
	if err := os.MkdirAll(filepath.Join(oldRoot, "Office"), 0o700); err != nil {
		t.Fatal(err)
	}
	fake := &fakeVolumes{byRoot: map[string]VolumeInfo{oldRoot: {ID: `\\?\volume{abc}\`, Total: 1000, Free: 50}}}
	useVolumes(t, fake)
	p.Destinations[0].Repository = filepath.Join(oldRoot, "Office", "BakvionRepository")
	if r := pipe(t, a, "savePlan", p); r.Error != nil {
		t.Fatalf("savePlan: %+v", r.Error)
	}
	ids := map[string]string{"planId": p.ID, "destinationId": "local"}
	if r := pipe(t, a, "initRepository", ids); r.Error != nil {
		t.Fatalf("set up: %+v", r.Error)
	}
	if job := backupOnce(t, a, p); job.State != "succeeded" || !strings.Contains(job.Notes, "Backup disk is 95% full (0.0 GB free)") {
		t.Fatalf("first backup: %+v", job)
	}

	// Unplug, plug back in: Windows gives the disk F: this time.
	if err := os.Rename(oldRoot, newRoot); err != nil {
		t.Fatal(err)
	}
	fake.byRoot = map[string]VolumeInfo{newRoot: {ID: `\\?\volume{abc}\`, Total: 1000, Free: 500}}
	job := backupOnce(t, a, p)
	if job.State != "succeeded" || !strings.Contains(job.Notes, "Backup disk found at "+newRoot+" (was "+oldRoot+")") {
		t.Fatalf("relocated backup: %+v", job)
	}
	if strings.Contains(job.Notes, "full") {
		t.Fatalf("space not re-measured: %q", job.Notes)
	}
	if r := pipe(t, a, "snapshots", ids); r.Error != nil {
		t.Fatalf("snapshots after relocation: %+v", r.Error)
	}
	usage, err := a.DiskUsages([]Plan{p})
	if err != nil || len(usage) != 1 || usage[0].UsedPercent != 50 {
		t.Fatalf("usage: %+v %v", usage, err)
	}

	// A different disk that happens to get F: is never used.
	if err := os.Rename(newRoot, oldRoot); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(newRoot, "Office", "BakvionRepository"), 0o700); err != nil {
		t.Fatal(err)
	}
	fake.byRoot = map[string]VolumeInfo{newRoot: {ID: `\\?\volume{other}\`, Total: 1000, Free: 500}}
	if err := os.RemoveAll(oldRoot); err != nil {
		t.Fatal(err)
	}
	if job := backupOnce(t, a, p); job.State != "failed" {
		t.Fatalf("other disk used: %+v", job)
	}
}

func TestFindGoogleDrive(t *testing.T) {
	users := t.TempDir()
	letters := t.TempDir()
	for _, d := range []string{
		filepath.Join(users, "Asha", "My Drive"),
		filepath.Join(users, "Ravi", "Google Drive", "My Drive"),
		filepath.Join(users, "Public", "My Drive"),
		filepath.Join(users, "Office"),
		filepath.Join(letters, "G", "My Drive"),
	} {
		if err := os.MkdirAll(d, 0o700); err != nil {
			t.Fatal(err)
		}
	}
	oldUsers, oldLetters := driveUsersRoots, driveLetters
	driveUsersRoots = func() []string { return []string{users} }
	driveLetters = func() []string { return []string{filepath.Join(letters, "G")} }
	t.Cleanup(func() { driveUsersRoots, driveLetters = oldUsers, oldLetters })

	got := FindGoogleDrive()
	want := []DriveFolder{
		{Path: filepath.Join(users, "Asha", "My Drive"), Mode: "mirror"},
		{Path: filepath.Join(users, "Ravi", "Google Drive", "My Drive"), Mode: "mirror"},
		{Path: filepath.Join(letters, "G", "My Drive"), Mode: "stream"},
	}
	if len(got) != len(want) {
		t.Fatalf("got %+v", got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %+v, want %+v", got, want)
		}
	}
}
