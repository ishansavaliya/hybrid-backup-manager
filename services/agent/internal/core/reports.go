package core

import (
	"context"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/ishansavaliya/hybrid-backup-manager/services/agent/internal/cloud"
)

// Email reports: every finished run is kept in a local outbox and sent to the
// server when this PC is online. The server decides what to email.

const (
	maxReportEmails  = 3
	reportBatchSize  = 50
	maxOutboxReports = 500
)

// Variables so tests can shorten them.
var reportInterval = 5 * time.Minute

var reportEmail = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

var reportModes = map[string]bool{"all": true, "failures": true, "off": true}

func (a *Agent) nudge() chan struct{} {
	a.nudgeOnce.Do(func() { a.reportNudge = make(chan struct{}, 1) })
	return a.reportNudge
}

// wakeReports asks the report loop to send now; it never blocks.
func (a *Agent) wakeReports() {
	select {
	case a.nudge() <- struct{}{}:
	default:
	}
}

// ReportSettings returns this PC's report choices ("all" with no addresses by default).
func (a *Agent) ReportSettings() (cloud.ReportSettings, error) {
	st := cloud.ReportSettings{Emails: []string{}, Mode: "all"}
	raw, ok, err := a.setting("report_emails")
	if err != nil {
		return st, err
	}
	if ok {
		if err = json.Unmarshal([]byte(raw), &st.Emails); err != nil {
			return st, err
		}
	}
	mode, ok, err := a.setting("report_mode")
	if err != nil {
		return st, err
	}
	if ok && reportModes[mode] {
		st.Mode = mode
	}
	return st, nil
}

// SetReportSettings validates and saves the choices, then sends them to the server.
func (a *Agent) SetReportSettings(in cloud.ReportSettings) (cloud.ReportSettings, error) {
	if !reportModes[in.Mode] {
		return cloud.ReportSettings{}, errors.New("choose when to send email reports")
	}
	emails := []string{}
	seen := map[string]bool{}
	for _, e := range in.Emails {
		e = strings.TrimSpace(e)
		if e == "" {
			continue
		}
		if len(e) > 160 || !reportEmail.MatchString(e) {
			return cloud.ReportSettings{}, errors.New("enter valid email addresses")
		}
		if key := strings.ToLower(e); !seen[key] {
			seen[key] = true
			emails = append(emails, e)
		}
	}
	if len(emails) > maxReportEmails {
		return cloud.ReportSettings{}, errors.New("add up to 3 email addresses")
	}
	raw, err := json.Marshal(emails)
	if err != nil {
		return cloud.ReportSettings{}, err
	}
	// The changed flag goes last and carries a stamp, so a send already in
	// progress (with the old settings) cannot clear it.
	for _, kv := range [][2]string{{"report_emails", string(raw)}, {"report_mode", in.Mode}, {"report_dirty", stamp()}} {
		if err = a.setSetting(kv[0], kv[1]); err != nil {
			return cloud.ReportSettings{}, err
		}
	}
	a.wakeReports()
	return cloud.ReportSettings{Emails: emails, Mode: in.Mode}, nil
}

// queueReport stores a finished run for sending; the outbox keeps the newest 500.
func (a *Agent) queueReport(r cloud.Report) error {
	if r.State != "succeeded" && r.State != "failed" && r.State != "interrupted" {
		return nil
	}
	if r.ScheduleKind == "" {
		r.ScheduleKind = "manual"
	}
	r.PlanName = clip(r.PlanName, 120)
	r.DestinationName = clip(r.DestinationName, 120)
	r.Error = clip(r.Error, 1000)
	r.Notes = clip(r.Notes, 300)
	raw, err := json.Marshal(r)
	if err != nil {
		return err
	}
	if _, err = a.Store.DB.Exec(`INSERT OR IGNORE INTO report_outbox(run_id,payload,created_at) VALUES(?,?,?)`, r.RunID, string(raw), stamp()); err != nil {
		return err
	}
	if _, err = a.Store.DB.Exec(`DELETE FROM report_outbox WHERE run_id NOT IN (SELECT run_id FROM report_outbox ORDER BY created_at DESC LIMIT ?)`, maxOutboxReports); err != nil {
		return err
	}
	a.wakeReports()
	return nil
}

func (a *Agent) outbox() ([]cloud.Report, error) {
	rows, err := a.Store.DB.Query(`SELECT payload FROM report_outbox ORDER BY created_at LIMIT ?`, reportBatchSize)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []cloud.Report{}
	for rows.Next() {
		var raw string
		if err = rows.Scan(&raw); err != nil {
			return nil, err
		}
		var r cloud.Report
		if json.Unmarshal([]byte(raw), &r) == nil {
			out = append(out, r)
		}
	}
	return out, rows.Err()
}

// FlushReports sends waiting reports (and changed settings) while signed in.
// Offline or server errors keep everything for the next try.
func (a *Agent) FlushReports(ctx context.Context) error {
	if a.Cloud == nil {
		return nil
	}
	row, err := a.Store.account()
	if err != nil || row.DeviceToken == "" {
		return err
	}
	for {
		mark, dirty, err := a.setting("report_dirty")
		if err != nil {
			return err
		}
		settings, err := a.ReportSettings()
		if err != nil {
			return err
		}
		batch, err := a.outbox()
		if err != nil {
			return err
		}
		if len(batch) == 0 && !dirty {
			return nil
		}
		if err = a.Cloud.SubmitReports(ctx, row.DeviceToken, cloud.ReportBatch{Settings: settings, Reports: batch}); err != nil {
			return err
		}
		for _, r := range batch {
			if _, err = a.Store.DB.Exec(`DELETE FROM report_outbox WHERE run_id=?`, r.RunID); err != nil {
				return err
			}
		}
		if dirty {
			if _, err = a.Store.DB.Exec(`DELETE FROM agent_settings WHERE key='report_dirty' AND value=?`, mark); err != nil {
				return err
			}
		}
		if len(batch) < reportBatchSize {
			return nil
		}
	}
}

// ReportLoop sends reports after each run and every 5 minutes until ctx ends.
func (a *Agent) ReportLoop(ctx context.Context) {
	for {
		_ = a.FlushReports(ctx)
		timer := time.NewTimer(reportInterval)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-a.nudge():
			timer.Stop()
		case <-timer.C:
		}
	}
}

// SendTestReport asks the server to email a test message now.
func (a *Agent) SendTestReport(ctx context.Context) error {
	if a.Cloud == nil {
		return errNoCloud
	}
	row, err := a.Store.account()
	if err != nil {
		return err
	}
	if row.DeviceToken == "" {
		return errors.New("sign in to send a test email")
	}
	mark, _, err := a.setting("report_dirty")
	if err != nil {
		return err
	}
	settings, err := a.ReportSettings()
	if err != nil {
		return err
	}
	if len(settings.Emails) == 0 {
		return errors.New("add an email address and save first")
	}
	if err = a.Cloud.SubmitReports(ctx, row.DeviceToken, cloud.ReportBatch{Settings: settings, Reports: []cloud.Report{}, Test: true}); err != nil {
		return err
	}
	_, err = a.Store.DB.Exec(`DELETE FROM agent_settings WHERE key='report_dirty' AND value=?`, mark)
	return err
}

func (a *Agent) handleReports(ctx context.Context, r Request) (any, error) {
	switch r.Method {
	case "reportSettings":
		return a.ReportSettings()
	case "setReportSettings":
		var p cloud.ReportSettings
		if err := decode(r.Params, &p); err != nil {
			return nil, errors.New("invalid report settings")
		}
		return a.SetReportSettings(p)
	case "sendTestReport":
		return map[string]bool{"sent": true}, a.SendTestReport(ctx)
	}
	return nil, errors.New("unsupported method")
}
