package core

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/ishansavaliya/hybrid-backup-manager/services/agent/internal/update"
)

type fakeUpdater struct {
	latest   update.Manifest
	err      error
	launched []string
}

func (f *fakeUpdater) Latest(context.Context) (update.Manifest, error) { return f.latest, f.err }
func (f *fakeUpdater) Download(_ context.Context, m update.Manifest) (string, error) {
	return "C:/ProgramData/Bakvion/updates/Bakvion-Setup-" + m.Version + ".exe", nil
}
func (f *fakeUpdater) Launch(p, _ string) error { f.launched = append(f.launched, p); return nil }

func TestUpdatesInstallOnlyNewerAndOnlyWhenIdle(t *testing.T) {
	e := newAccountEnv(t)
	if st, _ := e.a.UpdateStatus(); st.Automatic {
		t.Fatal("no updater, yet automatic")
	}
	u := &fakeUpdater{latest: update.Manifest{Version: "0.2.0"}}
	e.a.Updater, e.a.AppVersion = u, "0.1.0"

	// Offline: recorded, nothing installed.
	u.err = errors.New("update: offline: no route")
	st, err := e.a.CheckForUpdate(context.Background(), true)
	if err != nil || st.Error == "" || len(u.launched) != 0 || st.CheckedAt == "" {
		t.Fatalf("offline: %+v %v", st, err)
	}
	u.err = nil

	// A backup is queued: wait.
	e.signIn(t)
	p := e.plan(t)
	if r := e.call(t, "savePlan", p); r.Error != nil {
		t.Fatalf("savePlan: %+v", r.Error)
	}
	if _, err = e.a.Enqueue(p.ID); err != nil {
		t.Fatal(err)
	}
	if st, _ = e.a.CheckForUpdate(context.Background(), true); len(u.launched) != 0 || st.Error != errBusy.Error() || !st.Available {
		t.Fatalf("busy: %+v", st)
	}
	if _, err = e.store.DB.Exec(`UPDATE job_executions SET state='succeeded'`); err != nil {
		t.Fatal(err)
	}

	// Idle: installs, and does not start a second installer while it runs.
	r := e.call(t, "checkForUpdates", nil)
	if r.Error != nil {
		t.Fatalf("check: %+v", r.Error)
	}
	if st = r.Result.(UpdateStatus); st.Installing != "0.2.0" || len(u.launched) != 1 {
		t.Fatalf("install: %+v %v", st, u.launched)
	}
	if _, _ = e.a.CheckForUpdate(context.Background(), true); len(u.launched) != 1 {
		t.Fatal("second installer started")
	}

	// The new service starts as 0.2.0: installing clears, nothing newer.
	e.a.AppVersion = "0.2.0"
	if st, _ = e.a.UpdateStatus(); st.Installing != "" || st.Available || st.Current != "0.2.0" {
		t.Fatalf("after update: %+v", st)
	}

	// Never a downgrade.
	u.latest = update.Manifest{Version: "0.1.5"}
	if _, _ = e.a.CheckForUpdate(context.Background(), true); len(u.launched) != 1 {
		t.Fatal("downgraded")
	}
}

func TestStuckUpdateIsRetried(t *testing.T) {
	e := newAccountEnv(t)
	u := &fakeUpdater{latest: update.Manifest{Version: "0.2.0"}}
	e.a.Updater, e.a.AppVersion = u, "0.1.0"
	if st, _ := e.a.CheckForUpdate(context.Background(), true); st.Installing != "0.2.0" {
		t.Fatalf("install: %+v", st)
	}
	e.clock.Set(time.Now().Add(updateStuck + time.Minute))
	st, _ := e.a.UpdateStatus()
	if st.Installing != "" || st.Error == "" {
		t.Fatalf("stuck: %+v", st)
	}
	if st, _ = e.a.CheckForUpdate(context.Background(), true); len(u.launched) != 2 {
		t.Fatalf("not retried: %+v", st)
	}
}

func TestDevelopmentBuildsNeverUpdate(t *testing.T) {
	e := newAccountEnv(t)
	u := &fakeUpdater{latest: update.Manifest{Version: "9.0.0"}}
	e.a.Updater, e.a.AppVersion = u, "dev"
	st, _ := e.a.CheckForUpdate(context.Background(), true)
	if st.Automatic || st.Available || len(u.launched) != 0 {
		t.Fatalf("dev: %+v", st)
	}
}
