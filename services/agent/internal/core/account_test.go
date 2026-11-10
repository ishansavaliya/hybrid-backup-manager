package core

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/ishansavaliya/hybrid-backup-manager/services/agent/internal/cloud"
	"github.com/ishansavaliya/hybrid-backup-manager/services/agent/internal/license"
)

const day = 24 * time.Hour

var t0 = time.Date(2026, 11, 10, 6, 0, 0, 0, time.UTC)

type accountEnv struct {
	a     *Agent
	fake  *fakeCloud
	clock *testClock
	store *Store
	root  string
}

func newAccountEnv(t *testing.T) *accountEnv {
	t.Helper()
	root := t.TempDir()
	store, err := OpenStore(filepath.Join(root, "state", "agent.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { store.DB.Close() })
	clock := newTestClock(t0)
	// The engine binary does not exist: any restic-backed method fails inside the engine,
	// which proves the request got past membership gating.
	a, fake := accountAgent(t, store, Engine{Binary: filepath.Join(root, "no-restic")}, clock.Now)
	return &accountEnv{a: a, fake: fake, clock: clock, store: store, root: root}
}

func (e *accountEnv) call(t *testing.T, method string, params any) Response {
	t.Helper()
	var raw json.RawMessage
	if params != nil {
		b, err := json.Marshal(params)
		if err != nil {
			t.Fatal(err)
		}
		raw = b
	}
	return e.a.Handle(context.Background(), Request{Version: 1, Method: method, Params: raw})
}

// decodeStatus round-trips a pipe result through JSON so the wire field names are checked.
func decodeStatus(t *testing.T, r Response) AccountStatus {
	t.Helper()
	if r.Error != nil {
		t.Fatalf("unexpected error %+v", r.Error)
	}
	b, err := json.Marshal(r.Result)
	if err != nil {
		t.Fatal(err)
	}
	var st AccountStatus
	if err = json.Unmarshal(b, &st); err != nil {
		t.Fatal(err)
	}
	return st
}

func (e *accountEnv) status(t *testing.T) AccountStatus {
	t.Helper()
	return decodeStatus(t, e.call(t, "accountStatus", nil))
}

func (e *accountEnv) signIn(t *testing.T) AccountStatus {
	t.Helper()
	return decodeStatus(t, e.call(t, "signIn", map[string]string{"method": "password", "username": "acme", "password": "correct horse"}))
}

func (e *accountEnv) plan(t *testing.T) Plan {
	t.Helper()
	source := filepath.Join(e.root, "source")
	if err := os.MkdirAll(source, 0700); err != nil {
		t.Fatal(err)
	}
	secret := filepath.Join(e.root, "password")
	write(t, secret, "account-test-fixture-password")
	return Plan{ID: "plan1", Name: "Plan", Sources: []string{source}, Exclusions: []string{}, Destinations: []Destination{{ID: "local", Name: "Local", Repository: filepath.Join(e.root, "repository"), PasswordFile: secret}}}
}

func expectCode(t *testing.T, r Response, code string) {
	t.Helper()
	if r.Error == nil || r.Error.Code != code {
		t.Fatalf("want error %s, got %+v (result %v)", code, r.Error, r.Result)
	}
}

func expectNotGated(t *testing.T, method string, r Response) {
	t.Helper()
	if r.Error != nil && (r.Error.Code == "MEMBERSHIP_INACTIVE" || strings.Contains(r.Error.Message, ErrMembershipInactive.Error())) {
		t.Fatalf("%s blocked by membership: %+v", method, r.Error)
	}
}

func accountRowTokens(t *testing.T, s *Store) (sql.NullString, sql.NullString) {
	t.Helper()
	var device, lic sql.NullString
	if err := s.DB.QueryRow(`SELECT device_token,license_token FROM account WHERE id=1`).Scan(&device, &lic); err != nil {
		t.Fatal(err)
	}
	return device, lic
}

var hex32 = regexp.MustCompile(`^[0-9a-f]{32}$`)

func TestFreshStoreSignedOutWithStableInstallID(t *testing.T) {
	e := newAccountEnv(t)
	st := e.status(t)
	if st.SignedIn || st.Mode != license.ModeSignedOut || st.Reason != "signed_out" || st.SyncWarning || st.LastSyncAt != nil {
		t.Fatalf("fresh status: %+v", st)
	}
	if !hex32.MatchString(st.InstallID) {
		t.Fatalf("install id %q", st.InstallID)
	}
	if st.AppVersion != "0.1.0-test" {
		t.Fatalf("app version %q", st.AppVersion)
	}
	path := e.store.Path
	if err := e.store.DB.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := OpenStore(path)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.DB.Close()
	e.a.Store = reopened
	if again := e.status(t); again.InstallID != st.InstallID {
		t.Fatalf("install id changed %q -> %q", st.InstallID, again.InstallID)
	}
}

func TestSignInGrantsFullAndAllowsSavePlan(t *testing.T) {
	e := newAccountEnv(t)
	e.fake.expiresAt = t0.Add(6*day + time.Hour)
	st := e.signIn(t)
	if !st.SignedIn || st.Mode != license.ModeFull || st.Reason != "" || st.ClientName != "Acme Traders" || st.RenewContact != "support@example.com" {
		t.Fatalf("signed-in status: %+v", st)
	}
	if st.DaysLeft != 7 || !st.ShowBadge || st.ExpiresAt == nil || !st.ExpiresAt.Equal(e.fake.expiresAt) {
		t.Fatalf("expiry fields: %+v", st)
	}
	if st.LastSyncAt == nil || !st.LastSyncAt.Equal(t0) || st.DaysSinceSync != 0 || st.SyncWarning {
		t.Fatalf("sync fields: %+v", st)
	}
	if len(e.fake.signIns) != 1 {
		t.Fatalf("sign-in calls %d", len(e.fake.signIns))
	}
	req := e.fake.signIns[0]
	if req.Method != "password" || req.Username != "acme" || req.Password != "correct horse" || req.Code != "" {
		t.Fatalf("sign-in request: %+v", req)
	}
	if req.Device != (cloud.DeviceInfo{InstallID: st.InstallID, MachineName: "TEST-PC", WindowsVersion: "test-os", AppVersion: "0.1.0-test"}) {
		t.Fatalf("device info: %+v", req.Device)
	}
	if r := e.call(t, "savePlan", e.plan(t)); r.Error != nil {
		t.Fatalf("savePlan: %+v", r.Error)
	}
}

func TestSignInWithCode(t *testing.T) {
	e := newAccountEnv(t)
	st := decodeStatus(t, e.call(t, "signIn", map[string]string{"method": "code", "code": "012345"}))
	if st.Mode != license.ModeFull {
		t.Fatalf("status %+v", st)
	}
	if req := e.fake.signIns[0]; req.Method != "code" || req.Code != "012345" || req.Username != "" || req.Password != "" {
		t.Fatalf("request %+v", req)
	}
}

func TestSignInRejectsUnknownMethodWithoutCallingServer(t *testing.T) {
	e := newAccountEnv(t)
	for _, p := range []map[string]string{{"method": "token"}, {"method": "password", "username": "acme"}, {"method": "code"}} {
		if r := e.call(t, "signIn", p); r.Error == nil {
			t.Fatalf("accepted %v", p)
		}
	}
	if len(e.fake.signIns) != 0 {
		t.Fatal("server called for invalid sign-in")
	}
}

func TestSignInErrorCodes(t *testing.T) {
	cases := []struct {
		err  error
		code string
	}{
		{&cloud.APIError{Status: 401, Code: "invalid_credentials", Message: "Wrong username or password."}, "INVALID_CREDENTIALS"},
		{&cloud.APIError{Status: 401, Code: "code_invalid", Message: "This code is not valid or has expired."}, "CODE_INVALID"},
		{&cloud.APIError{Status: 409, Code: "pc_limit", Message: "PC limit reached (2)."}, "PC_LIMIT"},
		{&cloud.APIError{Status: 429, Code: "rate_limited", Message: "Too many attempts. Try again later."}, "RATE_LIMITED"},
		{fmt.Errorf("%w: dial refused", cloud.ErrOffline), "OFFLINE"},
	}
	for _, c := range cases {
		e := newAccountEnv(t)
		e.fake.signInErr = c.err
		r := e.call(t, "signIn", map[string]string{"method": "password", "username": "acme", "password": "correct horse"})
		expectCode(t, r, c.code)
		var apiErr *cloud.APIError
		if errors.As(c.err, &apiErr) && r.Error.Message != apiErr.Message {
			t.Fatalf("message %q", r.Error.Message)
		}
		if strings.Contains(r.Error.Message, "correct horse") {
			t.Fatal("password leaked")
		}
		if st := e.status(t); st.SignedIn {
			t.Fatal("failed sign-in saved a session")
		}
	}
}

func TestSignInWithInvalidLicenseSavesNothing(t *testing.T) {
	e := newAccountEnv(t)
	other, _ := accountAgent(t, e.store, Engine{}, e.clock.Now)
	e.fake.badLicense = other.Cloud.(*fakeCloud).license()
	r := e.call(t, "signIn", map[string]string{"method": "code", "code": "123456"})
	if r.Error == nil {
		t.Fatal("foreign-key license accepted")
	}
	if strings.Contains(r.Error.Message, testDeviceToken) || strings.Contains(r.Error.Message, e.fake.badLicense) {
		t.Fatal("token leaked into error")
	}
	if device, lic := accountRowTokens(t, e.store); device.Valid || lic.Valid {
		t.Fatal("session saved despite invalid license")
	}
}

func TestResponseModeIgnoredLicenseDecides(t *testing.T) {
	e := newAccountEnv(t)
	e.fake.mode, e.fake.bodyMode = "restore_only", "full"
	if st := e.signIn(t); st.Mode != license.ModeRestoreOnly || st.Reason != "pc_limit" || !st.SignedIn {
		t.Fatalf("pc-limit license: %+v", st)
	}
	expectCode(t, e.call(t, "savePlan", e.plan(t)), "MEMBERSHIP_INACTIVE")
	e.fake.mode, e.fake.bodyMode = "full", "restore_only"
	if st := e.signIn(t); st.Mode != license.ModeFull {
		t.Fatalf("full license: %+v", st)
	}
}

func TestOfflineStaysFullUntilExpiry(t *testing.T) {
	e := newAccountEnv(t)
	e.fake.expiresAt = t0.Add(60 * day)
	e.signIn(t)
	e.fake.refreshErr = fmt.Errorf("%w: connection refused", cloud.ErrOffline)
	e.clock.Add(2 * day)
	expectCode(t, e.call(t, "refreshLicense", nil), "OFFLINE")
	if st := e.status(t); st.Mode != license.ModeFull || st.SyncWarning || st.DaysSinceSync != 2 {
		t.Fatalf("day 2: %+v", st)
	}
	e.clock.Add(38 * day)
	expectCode(t, e.call(t, "refreshLicense", nil), "OFFLINE")
	st := e.status(t)
	if st.Mode != license.ModeFull || st.DaysSinceSync != 40 || !st.SyncWarning || st.DaysLeft != 20 || !st.SignedIn {
		t.Fatalf("day 40: %+v", st)
	}
	if r := e.call(t, "savePlan", e.plan(t)); r.Error != nil {
		t.Fatalf("savePlan offline: %+v", r.Error)
	}
	if device, lic := accountRowTokens(t, e.store); !device.Valid || !lic.Valid {
		t.Fatal("offline refresh cleared session")
	}
}

func TestExpiredMembershipBlocksBackupsButNotRestore(t *testing.T) {
	e := newAccountEnv(t)
	e.fake.expiresAt = t0.Add(30 * day)
	e.signIn(t)
	p := e.plan(t)
	if r := e.call(t, "savePlan", p); r.Error != nil {
		t.Fatal(r.Error)
	}
	e.clock.Add(31 * day)
	st := e.status(t)
	if st.Mode != license.ModeRestoreOnly || st.Reason != "expired" || !st.SignedIn {
		t.Fatalf("expired status: %+v", st)
	}
	r := e.call(t, "savePlan", p)
	expectCode(t, r, "MEMBERSHIP_INACTIVE")
	if r.Error.Message != "Membership inactive: new backups are paused" {
		t.Fatalf("message %q", r.Error.Message)
	}
	expectCode(t, e.call(t, "startBackup", map[string]string{"planId": p.ID}), "MEMBERSHIP_INACTIVE")
	target := map[string]string{"planId": p.ID, "destinationId": "local"}
	expectCode(t, e.call(t, "initRepository", target), "MEMBERSHIP_INACTIVE")
	if r := e.call(t, "overview", nil); r.Error != nil {
		t.Fatalf("overview: %+v", r.Error)
	}
	if r := e.call(t, "testDestination", target); r.Error != nil {
		t.Fatalf("testDestination: %+v", r.Error)
	}
	snap := map[string]string{"planId": p.ID, "destinationId": "local", "snapshotId": strings.Repeat("a", 64), "target": filepath.Join(e.root, "restored")}
	for _, m := range []string{"snapshots", "browse", "check", "restore"} {
		r := e.call(t, m, snap)
		expectNotGated(t, m, r)
		if r.Error == nil || r.Error.Code != "OPERATION_FAILED" {
			t.Fatalf("%s should reach the (missing) engine: %+v", m, r.Error)
		}
	}
	if jobs, err := e.store.Executions(); err != nil || len(jobs) != 0 {
		t.Fatalf("jobs created while inactive: %v %v", jobs, err)
	}
}

func TestClockRollbackRestoreOnlyUntilSuccessfulSync(t *testing.T) {
	e := newAccountEnv(t)
	e.signIn(t)
	e.clock.Add(10 * day)
	if st := e.status(t); st.Mode != license.ModeFull {
		t.Fatalf("before rollback: %+v", st)
	}
	e.clock.Add(-4 * time.Minute)
	if st := e.status(t); st.Mode != license.ModeFull {
		t.Fatalf("small skew tolerated: %+v", st)
	}
	e.clock.Add(-time.Hour)
	st := e.status(t)
	if st.Mode != license.ModeRestoreOnly || st.Reason != "clock" {
		t.Fatalf("after rollback: %+v", st)
	}
	expectCode(t, e.call(t, "savePlan", e.plan(t)), "MEMBERSHIP_INACTIVE")
	st = decodeStatus(t, e.call(t, "refreshLicense", nil))
	if st.Mode != license.ModeFull || st.Reason != "" {
		t.Fatalf("after sync: %+v", st)
	}
	if len(e.fake.refreshes) != 1 || e.fake.refreshes[0] != testDeviceToken {
		t.Fatalf("refresh token %v", e.fake.refreshes)
	}
}

func TestServerClockAheadWithinToleranceIsFullAfterRefresh(t *testing.T) {
	e := newAccountEnv(t)
	e.signIn(t)
	e.fake.now = func() time.Time { return e.clock.Now().Add(time.Hour) }
	st := decodeStatus(t, e.call(t, "refreshLicense", nil))
	if st.Mode != license.ModeFull || st.Reason != "" {
		t.Fatalf("server 1 h ahead: %+v", st)
	}
	// The mark stays at local time, so normal use afterwards is not "clock".
	e.clock.Add(time.Minute)
	if st = e.status(t); st.Mode != license.ModeFull {
		t.Fatalf("after 1 min: %+v", st)
	}
}

func TestServerClockAheadBeyondToleranceIsClockAfterRefresh(t *testing.T) {
	e := newAccountEnv(t)
	e.signIn(t)
	e.fake.now = func() time.Time { return e.clock.Now().Add(25 * time.Hour) }
	st := decodeStatus(t, e.call(t, "refreshLicense", nil))
	if st.Mode != license.ModeRestoreOnly || st.Reason != "clock" {
		t.Fatalf("server 25 h ahead: %+v", st)
	}
	expectCode(t, e.call(t, "savePlan", e.plan(t)), "MEMBERSHIP_INACTIVE")
	// Correcting the PC clock restores full mode.
	e.clock.Add(25 * time.Hour)
	if st = e.status(t); st.Mode != license.ModeFull {
		t.Fatalf("after clock fix: %+v", st)
	}
}

func TestRefreshRejectsOlderOrMismatchedLicense(t *testing.T) {
	cases := []struct {
		name  string
		setup func(f *fakeCloud)
	}{
		// Signed in at t0, so a license issued before t0 is a replay.
		{"older issuedAt", func(f *fakeCloud) { f.now = func() time.Time { return t0.Add(-time.Hour) } }},
		{"other client", func(f *fakeCloud) { f.clientID = "client-2" }},
		{"other device", func(f *fakeCloud) { f.deviceID = "device-2" }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			e := newAccountEnv(t)
			e.signIn(t)
			e.clock.Add(2 * day)
			e.status(t)
			device, oldLic := accountRowTokens(t, e.store)
			var hwBefore string
			if err := e.store.DB.QueryRow(`SELECT high_water FROM account WHERE id=1`).Scan(&hwBefore); err != nil {
				t.Fatal(err)
			}
			e.fake.expiresAt = t0.Add(900 * day)
			tc.setup(e.fake)
			expectCode(t, e.call(t, "refreshLicense", nil), CodeOperationFailed)
			gotDevice, lic := accountRowTokens(t, e.store)
			if gotDevice != device || lic != oldLic {
				t.Fatal("rejected license replaced the stored session")
			}
			var hwAfter string
			if err := e.store.DB.QueryRow(`SELECT high_water FROM account WHERE id=1`).Scan(&hwAfter); err != nil {
				t.Fatal(err)
			}
			if hwAfter != hwBefore {
				t.Fatalf("high water changed %q -> %q", hwBefore, hwAfter)
			}
			st := e.status(t)
			if !st.SignedIn || st.Mode != license.ModeFull || st.ExpiresAt == nil || !st.ExpiresAt.Equal(t0.Add(365*day)) {
				t.Fatalf("status %+v", st)
			}
		})
	}
}

func TestHighWaterAdvancesAndPersists(t *testing.T) {
	e := newAccountEnv(t)
	e.signIn(t)
	e.clock.Add(20 * day)
	e.status(t)
	var raw string
	if err := e.store.DB.QueryRow(`SELECT high_water FROM account WHERE id=1`).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	hw, err := time.Parse(time.RFC3339Nano, raw)
	if err != nil || !hw.Equal(t0.Add(20*day)) || !strings.HasSuffix(raw, "Z") {
		t.Fatalf("high water %q %v", raw, err)
	}
	e.clock.Add(-day)
	if st := e.status(t); st.Reason != "clock" {
		t.Fatalf("rollback below persisted high water: %+v", st)
	}
}

func TestRefreshUpdatesLicenseAndSyncTime(t *testing.T) {
	e := newAccountEnv(t)
	e.signIn(t)
	e.clock.Add(5 * day)
	e.fake.expiresAt = t0.Add(400 * day)
	st := decodeStatus(t, e.call(t, "refreshLicense", nil))
	if st.LastSyncAt == nil || !st.LastSyncAt.Equal(t0.Add(5*day)) || st.SyncWarning || st.DaysSinceSync != 0 {
		t.Fatalf("sync: %+v", st)
	}
	if st.ExpiresAt == nil || !st.ExpiresAt.Equal(t0.Add(400*day)) {
		t.Fatalf("license not replaced: %+v", st)
	}
}

func TestRefreshInvalidLicenseKeepsOld(t *testing.T) {
	e := newAccountEnv(t)
	e.signIn(t)
	_, oldLic := accountRowTokens(t, e.store)
	e.fake.badLicense = "garbage.token"
	if r := e.call(t, "refreshLicense", nil); r.Error == nil {
		t.Fatal("invalid refreshed license accepted")
	}
	if _, lic := accountRowTokens(t, e.store); lic != oldLic {
		t.Fatal("invalid license replaced the stored one")
	}
	if st := e.status(t); st.Mode != license.ModeFull {
		t.Fatalf("status %+v", st)
	}
}

func TestRefreshDeviceRemovedSignsOutKeepsPlans(t *testing.T) {
	for _, code := range []string{"device_removed", "unauthorized"} {
		e := newAccountEnv(t)
		e.signIn(t)
		if r := e.call(t, "savePlan", e.plan(t)); r.Error != nil {
			t.Fatal(r.Error)
		}
		e.fake.refreshErr = &cloud.APIError{Status: 401, Code: code, Message: "This PC was removed or signed out."}
		expectCode(t, e.call(t, "refreshLicense", nil), strings.ToUpper(code))
		st := e.status(t)
		if st.SignedIn || st.Mode != license.ModeSignedOut || st.SyncWarning {
			t.Fatalf("%s: %+v", code, st)
		}
		if device, lic := accountRowTokens(t, e.store); device.Valid || lic.Valid {
			t.Fatalf("%s: session not cleared", code)
		}
		var overview struct {
			Result struct {
				Plans []Plan `json:"plans"`
			} `json:"result"`
		}
		b, _ := json.Marshal(e.call(t, "overview", nil))
		if err := json.Unmarshal(b, &overview); err != nil || len(overview.Result.Plans) != 1 {
			t.Fatalf("%s: plans lost: %s %v", code, b, err)
		}
	}
}

func TestRefreshOtherClientErrorKeepsSession(t *testing.T) {
	e := newAccountEnv(t)
	e.signIn(t)
	e.fake.refreshErr = &cloud.APIError{Status: 429, Code: "rate_limited", Message: "Too many attempts. Try again later."}
	expectCode(t, e.call(t, "refreshLicense", nil), "RATE_LIMITED")
	if st := e.status(t); !st.SignedIn || st.Mode != license.ModeFull {
		t.Fatalf("status %+v", st)
	}
}

func TestRefreshWithoutTokenIsNoop(t *testing.T) {
	e := newAccountEnv(t)
	if err := e.a.Refresh(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(e.fake.refreshes) != 0 {
		t.Fatal("refresh called without a token")
	}
}

func TestQueuedJobFailsWhenMembershipExpires(t *testing.T) {
	e := newAccountEnv(t)
	e.fake.expiresAt = t0.Add(3 * day)
	e.signIn(t)
	p := e.plan(t)
	if r := e.call(t, "savePlan", p); r.Error != nil {
		t.Fatal(r.Error)
	}
	if r := e.call(t, "startBackup", map[string]string{"planId": p.ID}); r.Error != nil {
		t.Fatal(r.Error)
	}
	e.clock.Add(4 * day)
	if err := e.a.Work(context.Background(), false); err != nil {
		t.Fatal(err)
	}
	jobs, err := e.store.Executions()
	if err != nil || len(jobs) != 1 {
		t.Fatalf("jobs %v %v", jobs, err)
	}
	if jobs[0].State != "failed" || jobs[0].Error != "Membership inactive: new backups are paused" || jobs[0].FinishedAt == nil {
		t.Fatalf("job %+v", jobs[0])
	}
}

func TestTamperedLicenseIsSignedOut(t *testing.T) {
	e := newAccountEnv(t)
	e.signIn(t)
	_, lic := accountRowTokens(t, e.store)
	b := []byte(lic.String)
	if b[10] == 'A' {
		b[10] = 'B'
	} else {
		b[10] = 'A'
	}
	if _, err := e.store.DB.Exec(`UPDATE account SET license_token=? WHERE id=1`, string(b)); err != nil {
		t.Fatal(err)
	}
	st := e.status(t)
	if st.SignedIn || st.Mode != license.ModeSignedOut || st.ClientName != "" {
		t.Fatalf("tampered: %+v", st)
	}
	expectCode(t, e.call(t, "savePlan", e.plan(t)), "MEMBERSHIP_INACTIVE")
	// A successful sync with the still-stored device token repairs the license.
	if st := decodeStatus(t, e.call(t, "refreshLicense", nil)); st.Mode != license.ModeFull {
		t.Fatalf("after refresh: %+v", st)
	}
}

func TestSignOutClearsSessionEvenOffline(t *testing.T) {
	e := newAccountEnv(t)
	e.signIn(t)
	if r := e.call(t, "savePlan", e.plan(t)); r.Error != nil {
		t.Fatal(r.Error)
	}
	e.fake.signOutErr = fmt.Errorf("%w: offline", cloud.ErrOffline)
	st := decodeStatus(t, e.call(t, "signOut", nil))
	if st.SignedIn || st.Mode != license.ModeSignedOut {
		t.Fatalf("after sign-out: %+v", st)
	}
	if len(e.fake.signOuts) != 1 || e.fake.signOuts[0] != testDeviceToken {
		t.Fatalf("server sign-out %v", e.fake.signOuts)
	}
	if device, lic := accountRowTokens(t, e.store); device.Valid || lic.Valid {
		t.Fatal("session kept")
	}
	if plans, err := e.store.Plans(); err != nil || len(plans) != 1 {
		t.Fatalf("plans %v %v", plans, err)
	}
	if r := e.call(t, "signOut", nil); r.Error != nil {
		t.Fatalf("second sign-out: %+v", r.Error)
	}
	if len(e.fake.signOuts) != 1 {
		t.Fatal("server called without a token")
	}
}

func TestLicenseTickIntervals(t *testing.T) {
	e := newAccountEnv(t)
	e.signIn(t)
	if d := e.a.licenseTick(context.Background()); d != 6*time.Hour {
		t.Fatalf("success interval %v", d)
	}
	e.fake.refreshErr = cloud.ErrOffline
	if d := e.a.licenseTick(context.Background()); d != 5*time.Minute {
		t.Fatalf("failure interval %v", d)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	done := make(chan struct{})
	go func() {
		e.a.LicenseLoop(ctx)
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("license loop ignored cancellation")
	}
	if len(e.fake.refreshes) != 3 {
		t.Fatalf("loop must refresh at start: %d refreshes", len(e.fake.refreshes))
	}
}

func TestDevBypassNeedsBuildTag(t *testing.T) {
	t.Setenv("BAKVION_DEV_UNLICENSED", "1")
	e := newAccountEnv(t)
	r := e.call(t, "savePlan", e.plan(t))
	if devBypass {
		if r.Error != nil {
			t.Fatalf("dev bypass build refused: %+v", r.Error)
		}
		return
	}
	expectCode(t, r, "MEMBERSHIP_INACTIVE")
}

func TestMigratesVersionOneDatabase(t *testing.T) {
	path := filepath.Join(t.TempDir(), "agent.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY);` + initialSchema + `;INSERT INTO schema_migrations(version) VALUES(1);INSERT INTO backup_plans_cache(id,config) VALUES('old','{"id":"old","name":"Old","sources":[],"exclusions":[],"destinations":[]}')`); err != nil {
		t.Fatal(err)
	}
	if err = db.Close(); err != nil {
		t.Fatal(err)
	}
	s, err := OpenStore(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.DB.Close()
	var version int
	if err = s.DB.QueryRow(`SELECT MAX(version) FROM schema_migrations`).Scan(&version); err != nil || version != 4 {
		t.Fatalf("version %d %v", version, err)
	}
	plans, err := s.Plans()
	if err != nil || len(plans) != 1 || plans[0].ID != "old" {
		t.Fatalf("plans %v %v", plans, err)
	}
	var install, hw string
	if err = s.DB.QueryRow(`SELECT install_id,high_water FROM account WHERE id=1`).Scan(&install, &hw); err != nil {
		t.Fatal(err)
	}
	if !hex32.MatchString(install) {
		t.Fatalf("install id %q", install)
	}
	if _, err = time.Parse(time.RFC3339Nano, hw); err != nil {
		t.Fatalf("high water %q: %v", hw, err)
	}
}

func TestSignOutDuringRefreshIsNotUndone(t *testing.T) {
	e := newAccountEnv(t)
	e.signIn(t)
	e.fake.onRefresh = func() {
		if err := e.a.SignOut(context.Background()); err != nil {
			t.Error(err)
		}
	}
	if err := e.a.Refresh(context.Background()); err != nil {
		t.Fatal(err)
	}
	if device, lic := accountRowTokens(t, e.store); device.Valid || lic.Valid {
		t.Fatal("late refresh resurrected a signed-out session")
	}
}

func TestClipKeepsUTF8(t *testing.T) {
	if got := clip("ab\u20ac", 3); got != "ab" {
		t.Fatalf("clip %q", got)
	}
	if got := clip("PC-1", 64); got != "PC-1" {
		t.Fatalf("clip %q", got)
	}
}
