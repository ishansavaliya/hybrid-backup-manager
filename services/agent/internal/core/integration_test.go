package core

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func fixture(t *testing.T) (*Agent, Plan) {
	t.Helper()
	binary := os.Getenv("BAKVION_TEST_RESTIC")
	if binary == "" {
		t.Skip("set BAKVION_TEST_RESTIC to run REAL integration tests")
	}
	root := t.TempDir()
	source := filepath.Join(root, "source")
	if err := os.Mkdir(source, 0700); err != nil {
		t.Fatal(err)
	}
	secret := filepath.Join(root, "password")
	if err := os.WriteFile(secret, []byte("integration-only-random-fixture-password"), 0600); err != nil {
		t.Fatal(err)
	}
	store, err := OpenStore(filepath.Join(root, "state", "agent.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.DB.Close() })
	a := licensedAgent(t, store, Engine{Binary: binary})
	p := Plan{ID: "test", Name: "Test", Sources: []string{source}, Exclusions: []string{}, Destinations: []Destination{{ID: "local", Name: "Local", Repository: filepath.Join(root, "repository"), PasswordFile: secret}}}
	return a, p
}
func write(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0600); err != nil {
		t.Fatal(err)
	}
}
func TestRealBackupIncrementalHistoricalRestore(t *testing.T) {
	a, p := fixture(t)
	ctx := context.Background()
	d := p.Destinations[0]
	write(t, filepath.Join(p.Sources[0], "changed.txt"), "version one")
	write(t, filepath.Join(p.Sources[0], "deleted.txt"), "historical")
	if err := a.Validate(p); err != nil {
		t.Fatal(err)
	}
	if err := a.Store.SavePlan(p); err != nil {
		t.Fatal(err)
	}
	if err := a.Engine.Init(ctx, d); err != nil {
		t.Fatal(err)
	}
	if _, err := a.Enqueue(p.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := a.Enqueue(p.ID); err == nil {
		t.Fatal("duplicate active plan accepted")
	}
	if err := a.Work(ctx, false); err != nil {
		t.Fatal(err)
	}
	jobs, err := a.Store.Executions()
	if err != nil || len(jobs) != 1 || jobs[0].State != "succeeded" {
		t.Fatalf("initial backup: %+v %v", jobs, err)
	}
	first := jobs[0].SnapshotID
	write(t, filepath.Join(p.Sources[0], "changed.txt"), "version two")
	if err = os.Remove(filepath.Join(p.Sources[0], "deleted.txt")); err != nil {
		t.Fatal(err)
	}
	if _, err = a.Enqueue(p.ID); err != nil {
		t.Fatal(err)
	}
	if err = a.Work(ctx, false); err != nil {
		t.Fatal(err)
	}
	snapshots, err := a.Engine.Snapshots(ctx, d)
	if err != nil || len(snapshots) != 2 {
		t.Fatalf("snapshots: %v %v", snapshots, err)
	}
	target := filepath.Join(filepath.Dir(p.Sources[0]), "recovered")
	count, err := a.Engine.Restore(ctx, d, first, target, "")
	if err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("verified %d files", count)
	}
	// Restic mirrors snapshot paths below the recovery target.
	nodes, err := a.Engine.Nodes(ctx, d, first)
	if err != nil {
		t.Fatal(err)
	}
	for _, n := range nodes {
		if n.Name == "changed.txt" || n.Name == "deleted.txt" {
			rel, err := safeRelative(n.Path)
			if err != nil {
				t.Fatal(err)
			}
			b, err := os.ReadFile(filepath.Join(target, rel))
			if err != nil {
				t.Fatal(err)
			}
			expected := "version one"
			if n.Name == "deleted.txt" {
				expected = "historical"
			}
			if string(b) != expected {
				t.Fatalf("restored %s: %q", n.Name, b)
			}
		}
	}
	if _, err = a.Engine.Restore(ctx, d, first, target, ""); err == nil {
		t.Fatal("existing target overwrite allowed")
	}
	if err = a.Engine.Check(ctx, d); err != nil {
		t.Fatal(err)
	}
	wrong := filepath.Join(filepath.Dir(p.Sources[0]), "wrong")
	write(t, wrong, "wrong-password-at-least-16-characters")
	bad := d
	bad.PasswordFile = wrong
	if _, err = a.Engine.Snapshots(ctx, bad); err == nil {
		t.Fatal("wrong password accepted")
	}
}
func TestIndependentDestinationFailureAndOfflinePersistence(t *testing.T) {
	a, p := fixture(t)
	ctx := context.Background()
	write(t, filepath.Join(p.Sources[0], "file.txt"), "offline content")
	if err := a.Engine.Init(ctx, p.Destinations[0]); err != nil {
		t.Fatal(err)
	}
	bad := p.Destinations[0]
	bad.ID = "disconnected"
	bad.Repository = filepath.Join(filepath.Dir(bad.Repository), "missing-mount", "repo")
	p.Destinations = append(p.Destinations, bad)
	if err := a.Store.SavePlan(p); err != nil {
		t.Fatal(err)
	}
	if _, err := a.Enqueue(p.ID); err != nil {
		t.Fatal(err)
	}
	if err := a.Work(ctx, false); err != nil {
		t.Fatal(err)
	}
	jobs, err := a.Store.Executions()
	if err != nil {
		t.Fatal(err)
	}
	states := map[string]string{}
	for _, j := range jobs {
		states[j.DestinationID] = j.State
	}
	if states["local"] != "succeeded" || states["disconnected"] != "failed" {
		t.Fatalf("partial failure lost: %v", states)
	}
	reopened, err := OpenStore(a.Store.Path)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.DB.Close()
	history, err := reopened.Executions()
	if err != nil || len(history) != 2 {
		t.Fatalf("durable history: %v %v", history, err)
	}
	if _, err = os.Stat(bad.Repository); !os.IsNotExist(err) {
		t.Fatal("backup initialized absent destination")
	}
}
func TestSourceUnavailableAndRecursiveBackupRejected(t *testing.T) {
	a, p := fixture(t)
	p.Destinations[0].Repository = filepath.Join(p.Sources[0], "backup")
	if err := a.Validate(p); err == nil {
		t.Fatal("recursive repository accepted")
	}
	p.Destinations[0].Repository = filepath.Join(filepath.Dir(p.Sources[0]), "repo")
	p.Sources[0] = filepath.Join(filepath.Dir(p.Sources[0]), "absent")
	if err := a.Validate(p); err == nil {
		t.Fatal("missing source accepted")
	}
}
func TestSafeRelative(t *testing.T) {
	for _, p := range []string{"/../evil", "/a/../../evil", "/a\\evil", "/C:evil", "/a//b", "/NUL.txt", "/a. /file", "/a/./b", "/a/CON/file", "/x\x00y"} {
		if _, err := safeRelative(p); err == nil {
			t.Errorf("accepted %q", p)
		}
	}
	if _, err := safeRelative("/data/valid name.txt"); err != nil {
		t.Fatal(err)
	}
}
func TestProtocolAuthorizationBoundary(t *testing.T) {
	root := t.TempDir()
	s, err := OpenStore(filepath.Join(root, "agent.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer s.DB.Close()
	a := licensedAgent(t, s, Engine{})
	for _, req := range []Request{{Version: 2, Method: "overview"}, {Version: 1, Method: "executeShell"}, {Version: 1, Method: "restore", Params: []byte(`{"planId":"unknown","destinationId":"unknown"}`)}} {
		r := a.Handle(context.Background(), req)
		if r.Error == nil {
			t.Fatal("invalid operation accepted")
		}
		if strings.Contains(r.Error.Message, "password") {
			t.Fatal("secret leaked")
		}
	}
}

func TestSelectedRestoreAndFreshMachineRecovery(t *testing.T) {
	a, p := fixture(t)
	ctx := context.Background()
	d := p.Destinations[0]
	write(t, filepath.Join(p.Sources[0], "wanted.txt"), "selected content")
	write(t, filepath.Join(p.Sources[0], "other.txt"), "other content")
	if err := a.Engine.Init(ctx, d); err != nil {
		t.Fatal(err)
	}
	snapshot, err := a.Engine.Backup(ctx, d, p)
	if err != nil {
		t.Fatal(err)
	}
	nodes, err := a.Engine.Nodes(ctx, d, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	selected := ""
	for _, n := range nodes {
		if n.Name == "wanted.txt" {
			selected = n.Path
		}
	}
	if selected == "" {
		t.Fatal("file missing from manifest")
	}
	// New engine instance has no SQLite or hosted metadata dependency.
	fresh := Engine{Binary: a.Engine.Binary}
	target := filepath.Join(filepath.Dir(p.Sources[0]), "selected-recovery")
	count, err := fresh.Restore(ctx, d, snapshot, target, selected)
	if err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("selected restore verified %d", count)
	}
	if err = filepath.WalkDir(target, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.Name() == "other.txt" {
			t.Error("unselected file restored")
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
}
func TestInterruptedQueueRecovery(t *testing.T) {
	a, p := fixture(t)
	if err := a.Store.SavePlan(p); err != nil {
		t.Fatal(err)
	}
	ids, err := a.Enqueue(p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = a.Store.DB.Exec(`UPDATE job_executions SET state='running' WHERE id=?`, ids[0]); err != nil {
		t.Fatal(err)
	}
	if err = a.Work(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	jobs, err := a.Store.Executions()
	if err != nil {
		t.Fatal(err)
	}
	if jobs[0].State != "interrupted" {
		t.Fatalf("restart must not fabricate success: %+v", jobs)
	}
}
func TestRestoreRejectsLinksBeforeWriting(t *testing.T) {
	a, p := fixture(t)
	d := p.Destinations[0]
	ctx := context.Background()
	file := filepath.Join(p.Sources[0], "file.txt")
	write(t, file, "content")
	if err := os.Symlink("file.txt", filepath.Join(p.Sources[0], "link")); err != nil {
		t.Skipf("symlink privilege unavailable: %v", err)
	}
	if err := a.Engine.Init(ctx, d); err != nil {
		t.Fatal(err)
	}
	snapshot, err := a.Engine.Backup(ctx, d, p)
	if err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(filepath.Dir(p.Sources[0]), "unsafe-recovery")
	if _, err = a.Engine.Restore(ctx, d, snapshot, target, ""); err == nil {
		t.Fatal("link restored")
	}
	if _, err = os.Stat(target); !os.IsNotExist(err) {
		t.Fatal("failed restore published output")
	}
}

func TestCorruptedRepositoryFailsIntegrity(t *testing.T) {
	a, p := fixture(t)
	ctx := context.Background()
	d := p.Destinations[0]
	write(t, filepath.Join(p.Sources[0], "file.txt"), "protected data")
	if err := a.Engine.Init(ctx, d); err != nil {
		t.Fatal(err)
	}
	if _, err := a.Engine.Backup(ctx, d, p); err != nil {
		t.Fatal(err)
	}
	var pack string
	err := filepath.WalkDir(filepath.Join(d.Repository, "data"), func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !entry.IsDir() && pack == "" {
			pack = path
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if pack == "" {
		t.Fatal("no actual backup pack created")
	}
	if err = os.Chmod(pack, 0600); err != nil {
		t.Fatal(err)
	}
	write(t, pack, "corrupted object")
	if err = a.Engine.Check(ctx, d); err == nil {
		t.Fatal("corruption reported as healthy")
	}
}
func TestLocalDestinationProbe(t *testing.T) {
	root := t.TempDir()
	d := Destination{Repository: filepath.Join(root, "repo")}
	if err := TestLocalDestination(context.Background(), d); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatal("probe left files behind")
	}
	d.Repository = filepath.Join(root, "disconnected", "repo")
	if err = TestLocalDestination(context.Background(), d); err == nil {
		t.Fatal("missing mount test succeeded")
	}
}

func TestUnavailableCredentialDoesNotBlockOtherDestination(t *testing.T) {
	a, p := fixture(t)
	ctx := context.Background()
	write(t, filepath.Join(p.Sources[0], "file.txt"), "content")
	if err := a.Engine.Init(ctx, p.Destinations[0]); err != nil {
		t.Fatal(err)
	}
	second := p.Destinations[0]
	second.ID = "expired"
	second.Repository = filepath.Join(filepath.Dir(second.Repository), "second")
	second.PasswordFile = filepath.Join(filepath.Dir(second.PasswordFile), "second-password")
	write(t, second.PasswordFile, "another-separate-repository-password")
	p.Destinations = append(p.Destinations, second)
	if err := a.Store.SavePlan(p); err != nil {
		t.Fatal(err)
	}
	if _, err := a.Enqueue(p.ID); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(second.PasswordFile); err != nil {
		t.Fatal(err)
	}
	if err := a.Work(ctx, false); err != nil {
		t.Fatal(err)
	}
	jobs, err := a.Store.Executions()
	if err != nil {
		t.Fatal(err)
	}
	states := map[string]string{}
	for _, j := range jobs {
		states[j.DestinationID] = j.State
	}
	if states["local"] != "succeeded" || states["expired"] != "failed" {
		t.Fatalf("independent failure broken: %v", states)
	}
}

func TestFutureSchemaRejected(t *testing.T) {
	path := filepath.Join(t.TempDir(), "agent.db")
	s, err := OpenStore(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.DB.Exec(`INSERT INTO schema_migrations(version) VALUES(3)`); err != nil {
		t.Fatal(err)
	}
	if err = s.DB.Close(); err != nil {
		t.Fatal(err)
	}
	newer, err := OpenStore(path)
	if err == nil {
		newer.DB.Close()
		t.Fatal("newer schema accepted")
	}
}

func TestRealRestoreWorksAfterMembershipExpires(t *testing.T) {
	a, p := fixture(t)
	ctx := context.Background()
	write(t, filepath.Join(p.Sources[0], "kept.txt"), "still recoverable")
	request := func(method string, params any) Response {
		b, err := json.Marshal(params)
		if err != nil {
			t.Fatal(err)
		}
		return a.Handle(ctx, Request{Version: 1, Method: method, Params: b})
	}
	target := map[string]string{"planId": p.ID, "destinationId": "local"}
	for _, step := range []struct {
		method string
		params any
	}{{"savePlan", p}, {"initRepository", target}, {"startBackup", map[string]string{"planId": p.ID}}} {
		if r := request(step.method, step.params); r.Error != nil {
			t.Fatalf("%s: %+v", step.method, r.Error)
		}
	}
	if err := a.Work(ctx, false); err != nil {
		t.Fatal(err)
	}
	jobs, err := a.Store.Executions()
	if err != nil || len(jobs) != 1 || jobs[0].State != "succeeded" {
		t.Fatalf("licensed backup: %+v %v", jobs, err)
	}
	// Two years later the license has expired: backups stop, recovery keeps working.
	a.Clock = func() time.Time { return time.Now().Add(2 * 365 * 24 * time.Hour) }
	if r := request("startBackup", map[string]string{"planId": p.ID}); r.Error == nil || r.Error.Code != "MEMBERSHIP_INACTIVE" {
		t.Fatalf("expired startBackup: %+v", r.Error)
	}
	if r := request("snapshots", target); r.Error != nil {
		t.Fatalf("snapshots: %+v", r.Error)
	}
	if r := request("check", target); r.Error != nil {
		t.Fatalf("check: %+v", r.Error)
	}
	recovered := filepath.Join(filepath.Dir(p.Sources[0]), "recovered-after-expiry")
	r := request("restore", map[string]string{"planId": p.ID, "destinationId": "local", "snapshotId": jobs[0].SnapshotID, "target": recovered})
	if r.Error != nil {
		t.Fatalf("restore: %+v", r.Error)
	}
	found := false
	if err = filepath.WalkDir(recovered, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.Name() == "kept.txt" {
			b, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			found = string(b) == "still recoverable"
		}
		return nil
	}); err != nil || !found {
		t.Fatalf("restored content missing: %v", err)
	}
}
