package core

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/ishansavaliya/hybrid-backup-manager/services/agent/internal/update"
)

// Updater finds, downloads and launches releases; *update.Client implements it.
type Updater interface {
	Latest(context.Context) (update.Manifest, error)
	Download(context.Context, update.Manifest) (string, error)
	Launch(installer string) error
}

// Update cadence; variables so tests can shorten them.
var (
	updateFirstWait = 2 * time.Minute
	updateInterval  = 6 * time.Hour
	updateRetry     = time.Hour
	updateBusyRetry = 15 * time.Minute
	updateStuck     = 30 * time.Minute
)

// UpdateStatus is what Settings → About & updates shows.
type UpdateStatus struct {
	Current    string `json:"current"`
	Latest     string `json:"latest"`
	Available  bool   `json:"available"`
	CheckedAt  string `json:"checkedAt"`
	Installing string `json:"installing"`
	Error      string `json:"error"`
	// Automatic is false for development builds and PCs without the updater.
	Automatic bool `json:"automatic"`
}

var errBusy = errors.New("a backup is running; the update will install when it finishes")

func (a *Agent) busy() (bool, error) {
	var n int
	err := a.Store.DB.QueryRow(`SELECT count(*) FROM job_executions WHERE state IN ('queued','running')`).Scan(&n)
	return n > 0, err
}

func (a *Agent) value(key string) string {
	v, _, _ := a.setting(key)
	return v
}

// UpdateStatus reports the installed and newest versions.
func (a *Agent) UpdateStatus() (UpdateStatus, error) {
	st := UpdateStatus{
		Current:   a.AppVersion,
		Latest:    a.value("update_latest"),
		CheckedAt: a.value("update_checked_at"),
		Error:     a.value("update_error"),
		Automatic: a.Updater != nil && update.Newer("999.0.0", a.AppVersion),
	}
	st.Available = update.Newer(st.Latest, st.Current)
	if inst := a.value("update_installing"); inst != "" {
		version, started, _ := strings.Cut(inst, "@")
		t, err := time.Parse("2006-01-02T15:04:05.000000000Z", started)
		switch {
		case !update.Newer(version, a.AppVersion):
			// Installed: this service is now that version or newer.
			_ = a.setSetting("update_installing", "")
		case err == nil && a.now().Sub(t) > updateStuck:
			_ = a.setSetting("update_installing", "")
			_ = a.setSetting("update_error", "The update to "+version+" did not finish; it will be tried again.")
			st.Error = a.value("update_error")
		default:
			st.Installing = version
		}
	}
	return st, nil
}

// CheckForUpdate looks for a newer release and, with install, downloads and
// starts it when no backup is running. Offline just records the error.
func (a *Agent) CheckForUpdate(ctx context.Context, install bool) (UpdateStatus, error) {
	if a.Updater == nil {
		return a.UpdateStatus()
	}
	m, err := a.Updater.Latest(ctx)
	_ = a.setSetting("update_checked_at", stamp())
	if err != nil {
		msg := "Could not check for updates. It will try again later."
		if strings.Contains(err.Error(), "offline") {
			msg = "No internet connection. Updates will be checked when this PC is online."
		}
		_ = a.setSetting("update_error", msg)
		return a.UpdateStatus()
	}
	_ = a.setSetting("update_latest", m.Version)
	_ = a.setSetting("update_error", "")
	if !install || !update.Newer(m.Version, a.AppVersion) {
		return a.UpdateStatus()
	}
	if st, _ := a.UpdateStatus(); st.Installing != "" {
		return st, nil
	}
	if b, err := a.busy(); err != nil {
		return UpdateStatus{}, err
	} else if b {
		_ = a.setSetting("update_error", errBusy.Error())
		return a.UpdateStatus()
	}
	path, err := a.Updater.Download(ctx, m)
	if err != nil {
		_ = a.setSetting("update_error", "The update could not be downloaded. It will try again later.")
		return a.UpdateStatus()
	}
	// Re-check just before handing over: a backup may have started meanwhile.
	if b, _ := a.busy(); b {
		_ = a.setSetting("update_error", errBusy.Error())
		return a.UpdateStatus()
	}
	_ = a.setSetting("update_installing", m.Version+"@"+stamp())
	if err = a.Updater.Launch(path); err != nil {
		_ = a.setSetting("update_installing", "")
		_ = a.setSetting("update_error", "The update could not start. It will try again later.")
	}
	return a.UpdateStatus()
}

// UpdateLoop checks shortly after start, then every 6 hours (sooner after a
// failure or while a backup runs). Development builds never auto-update.
func (a *Agent) UpdateLoop(ctx context.Context) {
	wait := updateFirstWait
	for {
		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
		}
		st, err := a.CheckForUpdate(ctx, true)
		switch {
		case err != nil || (st.Error != "" && st.Error != errBusy.Error()):
			wait = updateRetry
		case st.Error == errBusy.Error():
			wait = updateBusyRetry
		default:
			wait = updateInterval
		}
	}
}

func (a *Agent) handleUpdates(ctx context.Context, r Request) (any, error) {
	if r.Method == "checkForUpdates" {
		return a.CheckForUpdate(ctx, true)
	}
	return a.UpdateStatus()
}
