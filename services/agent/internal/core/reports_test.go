package core

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/ishansavaliya/hybrid-backup-manager/services/agent/internal/cloud"
)

func (f *fakeCloud) batches() []cloud.ReportBatch {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]cloud.ReportBatch(nil), f.reports...)
}

func outboxCount(t *testing.T, e *accountEnv) int {
	t.Helper()
	var n int
	if err := e.store.DB.QueryRow(`SELECT COUNT(*) FROM report_outbox`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func run(id, state string) cloud.Report {
	return cloud.Report{RunID: id, PlanName: "Tally", DestinationName: "SSD", ScheduleKind: "daily", State: state, StartedAt: "2026-11-10T07:30:00Z", FinishedAt: "2026-11-10T07:31:00Z"}
}

func TestReportSettingsValidation(t *testing.T) {
	e := newAccountEnv(t)
	st, err := e.a.ReportSettings()
	if err != nil || st.Mode != "all" || len(st.Emails) != 0 {
		t.Fatalf("defaults: %+v %v", st, err)
	}
	saved, err := e.a.SetReportSettings(cloud.ReportSettings{Mode: "failures", Emails: []string{" Owner@Shop.in ", "owner@shop.in", "", "ca@firm.com"}})
	if err != nil || len(saved.Emails) != 2 || saved.Emails[0] != "Owner@Shop.in" {
		t.Fatalf("dedupe/trim: %+v %v", saved, err)
	}
	if st, _ = e.a.ReportSettings(); st.Mode != "failures" || len(st.Emails) != 2 {
		t.Fatalf("not stored: %+v", st)
	}
	bad := []cloud.ReportSettings{
		{Mode: "sometimes", Emails: []string{}},
		{Mode: "all", Emails: []string{"not-an-email"}},
		{Mode: "all", Emails: []string{"a@b.co", "c@d.co", "e@f.co", "g@h.co"}},
	}
	for _, b := range bad {
		if _, err := e.a.SetReportSettings(b); err == nil {
			t.Errorf("accepted %+v", b)
		}
	}
}

func TestReportsWaitOfflineThenSendOnce(t *testing.T) {
	e := newAccountEnv(t)
	if err := e.a.queueReport(run("r1", "succeeded")); err != nil {
		t.Fatal(err)
	}
	// Signed out: nothing is sent and nothing is lost.
	if err := e.a.FlushReports(context.Background()); err != nil || len(e.fake.batches()) != 0 || outboxCount(t, e) != 1 {
		t.Fatalf("signed-out flush: %v", err)
	}
	e.signIn(t)
	e.fake.reportErr = fmt.Errorf("%w: no route", cloud.ErrOffline)
	if err := e.a.FlushReports(context.Background()); !errors.Is(err, cloud.ErrOffline) || outboxCount(t, e) != 1 {
		t.Fatalf("offline flush: %v", err)
	}
	e.fake.reportErr = nil
	if err := e.a.queueReport(run("r2", "failed")); err != nil {
		t.Fatal(err)
	}
	if err := e.a.queueReport(run("r2", "failed")); err != nil { // same run twice
		t.Fatal(err)
	}
	if err := e.a.FlushReports(context.Background()); err != nil {
		t.Fatal(err)
	}
	b := e.fake.batches()
	if len(b) != 1 || len(b[0].Reports) != 2 || b[0].Reports[0].RunID != "r1" || b[0].Settings.Mode != "all" {
		t.Fatalf("batch: %+v", b)
	}
	if outboxCount(t, e) != 0 {
		t.Fatal("outbox not emptied")
	}
	if err := e.a.FlushReports(context.Background()); err != nil || len(e.fake.batches()) != 1 {
		t.Fatalf("empty flush sent again: %v", err)
	}
}

func TestChangedSettingsAreSentWithoutReports(t *testing.T) {
	e := newAccountEnv(t)
	e.signIn(t)
	if _, err := e.a.SetReportSettings(cloud.ReportSettings{Mode: "all", Emails: []string{"owner@shop.in"}}); err != nil {
		t.Fatal(err)
	}
	if err := e.a.FlushReports(context.Background()); err != nil {
		t.Fatal(err)
	}
	b := e.fake.batches()
	if len(b) != 1 || len(b[0].Reports) != 0 || b[0].Settings.Emails[0] != "owner@shop.in" {
		t.Fatalf("settings batch: %+v", b)
	}
	if err := e.a.FlushReports(context.Background()); err != nil || len(e.fake.batches()) != 1 {
		t.Fatal("settings sent twice")
	}
}

func TestLargeOutboxSendsInBatchesAndKeepsNewest(t *testing.T) {
	e := newAccountEnv(t)
	for i := 0; i < maxOutboxReports+20; i++ {
		if err := e.a.queueReport(run(fmt.Sprintf("r%03d", i), "succeeded")); err != nil {
			t.Fatal(err)
		}
	}
	if n := outboxCount(t, e); n != maxOutboxReports {
		t.Fatalf("outbox kept %d", n)
	}
	e.signIn(t)
	if err := e.a.FlushReports(context.Background()); err != nil {
		t.Fatal(err)
	}
	total := 0
	for _, b := range e.fake.batches() {
		if len(b.Reports) > reportBatchSize {
			t.Fatalf("batch of %d", len(b.Reports))
		}
		total += len(b.Reports)
	}
	if total != maxOutboxReports || outboxCount(t, e) != 0 {
		t.Fatalf("sent %d, left %d", total, outboxCount(t, e))
	}
}

func TestTestEmailNeedsSignInAndAddress(t *testing.T) {
	e := newAccountEnv(t)
	if r := e.call(t, "sendTestReport", nil); r.Error == nil {
		t.Fatal("test email while signed out")
	}
	e.signIn(t)
	if r := e.call(t, "sendTestReport", nil); r.Error == nil {
		t.Fatal("test email without an address")
	}
	if r := e.call(t, "setReportSettings", cloud.ReportSettings{Mode: "off", Emails: []string{"owner@shop.in"}}); r.Error != nil {
		t.Fatalf("save: %+v", r.Error)
	}
	if r := e.call(t, "sendTestReport", nil); r.Error != nil {
		t.Fatalf("test email: %+v", r.Error)
	}
	b := e.fake.batches()
	if len(b) != 1 || !b[0].Test || b[0].Settings.Emails[0] != "owner@shop.in" {
		t.Fatalf("test batch: %+v", b)
	}
}

func TestReportLoopWakesAfterARun(t *testing.T) {
	e := newAccountEnv(t)
	e.signIn(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go e.a.ReportLoop(ctx)
	time.Sleep(50 * time.Millisecond)
	if err := e.a.queueReport(run("r1", "failed")); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		for _, b := range e.fake.batches() {
			if len(b.Reports) == 1 && b.Reports[0].State == "failed" {
				return
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("report loop did not send the failed run")
}
