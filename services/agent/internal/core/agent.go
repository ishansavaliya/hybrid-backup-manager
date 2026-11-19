package core

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/gofrs/flock"
	"github.com/ishansavaliya/hybrid-backup-manager/services/agent/internal/cloud"
	"github.com/ishansavaliya/hybrid-backup-manager/services/agent/internal/license"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type Agent struct {
	Store  *Store
	Engine Engine
	// Membership (see account.go). A nil Cloud or LicenseKey leaves the agent signed out.
	Cloud       CloudAPI
	LicenseKey  ed25519.PublicKey
	Clock       func() time.Time
	AppVersion  string
	MachineInfo func() (machine, windows string)
	// Sealer protects managed destination keys; nil picks the platform default.
	Sealer Sealer

	// Updater installs new releases; nil disables updates (development, tests).
	Updater Updater

	nudgeOnce   sync.Once
	reportNudge chan struct{}
}

func NewID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b[:])
}
func now() string { return time.Now().UTC().Format(time.RFC3339Nano) }
func (a *Agent) Validate(p Plan) error {
	if err := ValidatePlan(p, a.Store.Path); err != nil {
		return err
	}
	all, err := a.Store.Plans()
	if err != nil {
		return err
	}
	for _, other := range all {
		if other.ID == p.ID {
			continue
		}
		for _, left := range append(append([]Destination{}, other.Destinations...), p.Destinations...) {
			repo, err := canonical(left.Repository)
			if err != nil {
				return err
			}
			for _, source := range append(append([]string{}, other.Sources...), p.Sources...) {
				s, err := canonical(source)
				if err != nil {
					return err
				}
				if overlaps(s, repo) || overlaps(repo, s) {
					return errors.New("repository overlaps a registered backup source")
				}
			}
		}
	}
	return nil
}
func (a *Agent) Enqueue(id string) ([]string, error) {
	p, err := a.Store.Plan(id)
	if err != nil {
		return nil, err
	}
	if p.RestoreOnly {
		return nil, ErrRestoreOnlyPlan
	}
	if err = a.Validate(p); err != nil {
		return nil, err
	}
	tx, err := a.Store.DB.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var active int
	if err = tx.QueryRow(`SELECT count(*) FROM job_executions WHERE plan_id=? AND state IN ('queued','running')`, id).Scan(&active); err != nil {
		return nil, err
	}
	if active > 0 {
		return nil, errors.New("plan already queued or running")
	}
	ids := []string{}
	for _, d := range p.Destinations {
		jobID := NewID()
		b, err := json.Marshal(struct {
			Plan        Plan        `json:"plan"`
			Destination Destination `json:"destination"`
		}{p, d})
		if err != nil {
			return nil, err
		}
		_, err = tx.Exec(`INSERT INTO job_executions(id,plan_id,destination_id,state,started_at,config)VALUES(?,?,?,'queued',?,?)`, jobID, id, d.ID, now(), string(b))
		if err != nil {
			return nil, err
		}
		ids = append(ids, jobID)
	}
	return ids, tx.Commit()
}
func (a *Agent) Work(ctx context.Context, continuous bool) error {
	lock := flock.New(a.Store.Path + ".worker.lock")
	ok, err := lock.TryLock()
	if err != nil {
		return err
	}
	if !ok {
		return errors.New("another worker is active")
	}
	defer lock.Unlock()
	if _, err = a.Store.DB.Exec(`UPDATE job_executions SET state='interrupted',finished_at=?,error='worker stopped before confirming completion; inspect snapshots before retry' WHERE state='running'`, now()); err != nil {
		return err
	}
	for {
		worked, err := a.next(ctx)
		if err != nil {
			return err
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if !continuous && !worked {
			return nil
		}
		if !worked {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(time.Second):
			}
		}
	}
}
func (a *Agent) next(ctx context.Context) (bool, error) {
	var id, raw string
	err := a.Store.DB.QueryRow(`SELECT id,config FROM job_executions WHERE state='queued' ORDER BY started_at LIMIT 1`).Scan(&id, &raw)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	var cfg struct {
		Plan        Plan        `json:"plan"`
		Destination Destination `json:"destination"`
	}
	if err = json.Unmarshal([]byte(raw), &cfg); err != nil {
		return false, err
	}
	if err = a.requireFull(); err != nil {
		if !errors.Is(err, ErrMembershipInactive) {
			return false, err
		}
		_, err = a.Store.DB.Exec(`UPDATE job_executions SET state='failed',finished_at=?,error=? WHERE id=?`, now(), err.Error(), id)
		return true, err
	}
	startedAt := now()
	if _, err = a.Store.DB.Exec(`UPDATE job_executions SET state='running',started_at=? WHERE id=?`, startedAt, id); err != nil {
		return false, err
	}
	var snapshot string
	var noteList []string
	validated := cfg.Plan
	validated.Destinations = []Destination{cfg.Destination}
	err = a.Validate(validated)
	dest := cfg.Destination
	if err == nil {
		dest, err = a.withKey(cfg.Destination, false)
	}
	if err == nil {
		var moved string
		if dest, moved = a.locate(dest); moved != "" {
			noteList = append(noteList, moved)
		}
	}
	partial := false
	if err == nil {
		var res BackupResult
		res, err = a.Engine.BackupDetailed(ctx, dest, cfg.Plan)
		snapshot = res.Snapshot
		if res.Summary != "" {
			noteList = append(noteList, res.Summary)
		}
		noteList = append(noteList, res.Warnings...)
		for _, w := range res.Warnings {
			partial = partial || w == WarnUnreadable
		}
	}
	if err == nil && cfg.Plan.Retention.Enabled && ctx.Err() == nil {
		// Cleanup only after a complete, confirmed snapshot: a partial one must
		// never replace an older complete version. A cleanup failure never fails the backup.
		switch forgetErr := error(nil); {
		case partial:
			noteList = append(noteList, "Cleanup skipped: some files could not be read")
		default:
			if forgetErr = a.Engine.Forget(ctx, dest, cfg.Plan.ID, cfg.Plan.Retention); forgetErr != nil {
				noteList = append(noteList, "Cleanup skipped: "+forgetErr.Error())
			} else {
				noteList = append(noteList, "Old versions cleaned up")
			}
		}
	}
	// Free space is measured after every run, including failed ones (a full
	// disk is a common cause).
	if info, volErr := a.rememberVolume(cfg.Destination, dest.Repository); volErr == nil {
		if n := diskNote(info); n != "" {
			noteList = append(noteList, n)
		}
	}
	notes := strings.Join(noteList, "\n")
	state := "succeeded"
	message := ""
	if err != nil {
		state = "failed"
		message = err.Error()
	}
	if ctx.Err() != nil {
		state = "interrupted"
		message = "operation interrupted; repository may contain an unrecorded completed snapshot"
	}
	finishedAt := now()
	if _, dbErr := a.Store.DB.Exec(`UPDATE job_executions SET state=?,snapshot_id=?,finished_at=?,error=?,notes=? WHERE id=?`, state, snapshot, finishedAt, message, notes, id); dbErr != nil {
		return true, dbErr
	}
	// The run is recorded; a report problem never fails it.
	_ = a.queueReport(cloud.Report{
		RunID: id, PlanName: cfg.Plan.Name, DestinationName: cfg.Destination.Name,
		ScheduleKind: cfg.Plan.Schedule.Kind, State: state,
		StartedAt: startedAt, FinishedAt: finishedAt, Error: message, Notes: notes,
	})
	return true, nil
}
func (a *Agent) destination(plan, id string) (Destination, error) {
	p, err := a.Store.Plan(plan)
	if err != nil {
		return Destination{}, err
	}
	for _, d := range p.Destinations {
		if d.ID == id {
			return d, nil
		}
	}
	return Destination{}, errors.New("destination not found")
}
func decode(raw json.RawMessage, target any) error {
	if len(raw) == 0 {
		return errors.New("params required")
	}
	return json.Unmarshal(raw, target)
}
func (a *Agent) Handle(ctx context.Context, r Request) Response {
	result, err := a.handle(ctx, r)
	if err != nil {
		return Response{Version: 1, Error: &APIError{Code: errorCode(err), Message: err.Error()}}
	}
	return Response{Version: 1, Result: result}
}
func (a *Agent) handle(ctx context.Context, r Request) (any, error) {
	if r.Version != 1 {
		return nil, errors.New("unsupported protocol version")
	}
	if gatedMethods[r.Method] {
		if err := a.requireFull(); err != nil {
			return nil, err
		}
	}
	switch r.Method {
	case "accountStatus", "signIn", "signOut", "refreshLicense", "submitLead":
		return a.handleAccount(ctx, r)
	case "reportSettings", "setReportSettings", "sendTestReport":
		return a.handleReports(ctx, r)
	case "openExistingBackup":
		var p struct {
			Name       string `json:"name"`
			Repository string `json:"repository"`
			Key        string `json:"key"`
		}
		if err := decode(r.Params, &p); err != nil {
			return nil, err
		}
		return a.OpenExistingBackup(ctx, p.Name, p.Repository, p.Key)
	case "deletePlan":
		var p struct {
			PlanID string `json:"planId"`
		}
		if err := decode(r.Params, &p); err != nil {
			return nil, err
		}
		return map[string]bool{"deleted": true}, a.DeletePlan(p.PlanID)
	case "updateStatus", "checkForUpdates", "installUpdate":
		return a.handleUpdates(ctx, r)
	case "findGoogleDrive":
		return map[string]any{"folders": FindGoogleDrive()}, nil
	case "overview":
		plans, err := a.Store.Plans()
		if err != nil {
			return nil, err
		}
		jobs, err := a.Store.Executions()
		if err != nil {
			return nil, err
		}
		mode := license.ModeSignedOut
		if st, accountErr := a.AccountStatus(); accountErr == nil {
			mode = st.Mode
		}
		next, err := a.NextRuns()
		if err != nil {
			return nil, err
		}
		kit, err := a.KitStatus()
		if err != nil {
			return nil, err
		}
		disks, err := a.DiskUsages(plans)
		if err != nil {
			return nil, err
		}
		return map[string]any{"status": map[string]any{"version": a.AppVersion, "mode": mode, "capabilities": []string{"local-backup", "snapshot-browse", "verified-new-folder-restore", "schedules", "retention", "managed-keys", "shadow-copy", "disk-relocation", "google-drive"}}, "plans": plans, "executions": jobs, "nextRuns": next, "kit": kit, "disks": disks}, nil
	case "savePlan":
		var p Plan
		if err := decode(r.Params, &p); err != nil {
			return nil, err
		}
		// Restore-only plans come only from openExistingBackup and stay that way.
		if old, err := a.Store.Plan(p.ID); p.RestoreOnly || (err == nil && old.RestoreOnly) {
			return nil, ErrRestoreOnlyPlan
		}
		if err := a.Validate(p); err != nil {
			return nil, err
		}
		if err := a.Store.SavePlan(p); err != nil {
			return nil, err
		}
		// A new or changed schedule counts from now.
		return map[string]bool{"saved": true}, a.setScheduleState(p.ID, a.now())
	case "startBackup":
		var p struct {
			PlanID string `json:"planId"`
		}
		if err := decode(r.Params, &p); err != nil {
			return nil, err
		}
		ids, err := a.Enqueue(p.PlanID)
		return map[string]any{"jobIds": ids}, err
	case "exportRecoveryKit":
		var p struct {
			Directory string `json:"directory"`
		}
		if err := decode(r.Params, &p); err != nil {
			return nil, err
		}
		path, err := a.ExportRecoveryKit(p.Directory)
		if err != nil {
			return nil, err
		}
		return map[string]string{"path": path}, nil
	case "testDestination", "initRepository", "connectDestination", "snapshots", "browse", "check", "restore":
		var p struct {
			PlanID        string `json:"planId"`
			DestinationID string `json:"destinationId"`
			SnapshotID    string `json:"snapshotId"`
			Target        string `json:"target"`
			Selection     string `json:"selection"`
			Key           string `json:"key"`
		}
		if err := decode(r.Params, &p); err != nil {
			return nil, err
		}
		d, err := a.destination(p.PlanID, p.DestinationID)
		if err != nil {
			return nil, err
		}
		// Keys are stored by the saved path, so fetch the key before relocating.
		if r.Method != "testDestination" && r.Method != "initRepository" && r.Method != "connectDestination" {
			if d, err = a.withKey(d, false); err != nil {
				return nil, err
			}
		}
		if r.Method != "initRepository" && r.Method != "connectDestination" {
			saved := d
			d, _ = a.locate(d)
			current := d.Repository
			defer func() { _, _ = a.rememberVolume(saved, current) }()
		}
		switch r.Method {
		case "testDestination":
			return map[string]bool{"writable": true}, TestLocalDestination(ctx, d)
		case "initRepository":
			plan, err := a.Store.Plan(p.PlanID)
			if err != nil {
				return nil, err
			}
			if err = a.Validate(plan); err != nil {
				return nil, err
			}
			if err = a.SetUpDestination(ctx, d); err != nil {
				return nil, err
			}
			_, _ = a.rememberVolume(d, d.Repository)
			return map[string]bool{"initialized": true}, nil
		case "connectDestination":
			return map[string]bool{"connected": true}, a.ConnectDestination(ctx, d, p.Key)
		}
		switch r.Method {
		case "snapshots":
			return a.Engine.Snapshots(ctx, d)
		case "browse":
			return a.Engine.Nodes(ctx, d, p.SnapshotID)
		case "check":
			return map[string]bool{"verified": true}, a.Engine.Check(ctx, d)
		case "restore":
			if !filepath.IsAbs(p.Target) {
				return nil, errors.New("absolute target required")
			}
			id := NewID()
			if _, err = a.Store.DB.Exec(`INSERT INTO restore_history(id,snapshot_id,target,state,created_at)VALUES(?,?,?,'running',?)`, id, p.SnapshotID, p.Target, now()); err != nil {
				return nil, err
			}
			count, restoreErr := a.Engine.Restore(ctx, d, p.SnapshotID, p.Target, p.Selection)
			state := "succeeded"
			message := ""
			if restoreErr != nil {
				state = "failed"
				message = restoreErr.Error()
			}
			if _, err = a.Store.DB.Exec(`UPDATE restore_history SET state=?,error=? WHERE id=?`, state, message, id); err != nil {
				return nil, fmt.Errorf("restore history persistence failed: %w", err)
			}
			return map[string]any{"id": id, "verifiedFiles": count, "target": p.Target}, restoreErr
		}
	}
	return nil, errors.New("unsupported method")
}
func DefaultState() string {
	if v := os.Getenv("BAKVION_STATE"); v != "" {
		return v
	}
	dir, err := os.UserConfigDir()
	if err != nil {
		return filepath.Join(".", "bakvion-state", "agent.db")
	}
	return filepath.Join(dir, "Bakvion", "agent.db")
}
