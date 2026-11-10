package core

import (
	"context"
	"errors"
	"os"
	"runtime"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/ishansavaliya/hybrid-backup-manager/services/agent/internal/cloud"
	"github.com/ishansavaliya/hybrid-backup-manager/services/agent/internal/license"
)

// CloudAPI is the server device API; *cloud.Client implements it.
type CloudAPI interface {
	SignIn(context.Context, cloud.SignInRequest) (cloud.SignInResult, error)
	RefreshLicense(context.Context, string, string) (string, error)
	SignOut(context.Context, string) error
}

// AccountStatus is the pipe view of the membership. It never contains tokens.
// DaysSinceSync is 0 when the device has never synced.
type AccountStatus struct {
	SignedIn      bool         `json:"signedIn"`
	Mode          license.Mode `json:"mode"`
	Reason        string       `json:"reason"`
	ClientName    string       `json:"clientName"`
	ExpiresAt     *time.Time   `json:"expiresAt"`
	DaysLeft      int          `json:"daysLeft"`
	ShowBadge     bool         `json:"showBadge"`
	RenewContact  string       `json:"renewContact"`
	LastSyncAt    *time.Time   `json:"lastSyncAt"`
	DaysSinceSync int          `json:"daysSinceSync"`
	SyncWarning   bool         `json:"syncWarning"`
	InstallID     string       `json:"installId"`
	AppVersion    string       `json:"appVersion"`
}

// License refresh cadence; variables so tests can shorten them.
var (
	licenseRefreshInterval = 6 * time.Hour
	licenseRetryInterval   = 5 * time.Minute
)

const syncWarningAfter = 3 * 24 * time.Hour

// gatedMethods create or schedule new backups and require full membership.
var gatedMethods = map[string]bool{"savePlan": true, "startBackup": true, "initRepository": true}

var (
	errNoCloud        = errors.New("account server is not configured")
	errInvalidLicense = errors.New("the server returned a license this app cannot verify")
)

func (a *Agent) clock() time.Time {
	if a.Clock != nil {
		return a.Clock().UTC()
	}
	return time.Now().UTC()
}

func (a *Agent) machineInfo() (string, string) {
	if a.MachineInfo != nil {
		return a.MachineInfo()
	}
	host, _ := os.Hostname()
	return host, runtime.GOOS
}

// clip shortens s to at most n bytes without splitting a UTF-8 sequence (server field limits).
func clip(s string, n int) string {
	if len(s) <= n {
		return s
	}
	s = s[:n]
	for len(s) > 0 && !utf8.ValidString(s) {
		s = s[:len(s)-1]
	}
	return s
}

// syncHighWater is the clock mark after a verified sync: the server's issue time or
// the local time, whichever is later. A sync replaces the old mark, so a PC whose
// clock was once ahead recovers from the "clock" state on its next successful sync.
func syncHighWater(p license.Payload, now time.Time) time.Time {
	if p.IssuedAt.After(now) {
		return p.IssuedAt.UTC()
	}
	return now
}

func (a *Agent) verifiedPayload(row accountRow) *license.Payload {
	if row.DeviceToken == "" || row.LicenseToken == "" {
		return nil
	}
	p, err := license.Verify(row.LicenseToken, a.LicenseKey)
	if err != nil {
		return nil
	}
	return &p
}

// AccountStatus evaluates the stored license offline and advances the clock high-water mark.
func (a *Agent) AccountStatus() (AccountStatus, error) {
	row, err := a.Store.account()
	if err != nil {
		return AccountStatus{}, err
	}
	now := a.clock()
	// An unreadable mark counts as zero and is replaced by now below.
	highWater, _ := time.Parse(time.RFC3339Nano, row.HighWater)
	p := a.verifiedPayload(row)
	st := license.Evaluate(p, now, highWater)
	if now.After(highWater) {
		if err = a.Store.advanceHighWater(row.HighWater, now); err != nil {
			return AccountStatus{}, err
		}
	}
	out := AccountStatus{
		SignedIn: p != nil, Mode: st.Mode, Reason: st.Reason, ExpiresAt: st.ExpiresAt,
		DaysLeft: st.DaysLeft, ShowBadge: st.ShowBadge, LastSyncAt: row.LastSyncAt,
		InstallID: row.InstallID, AppVersion: a.AppVersion,
	}
	if row.LastSyncAt != nil && now.After(*row.LastSyncAt) {
		out.DaysSinceSync = int(now.Sub(*row.LastSyncAt) / (24 * time.Hour))
	}
	if p != nil {
		out.ClientName, out.RenewContact = p.ClientName, p.RenewContact
		out.SyncWarning = row.LastSyncAt == nil || now.Sub(*row.LastSyncAt) > syncWarningAfter
	}
	return out, nil
}

// requireFull returns ErrMembershipInactive unless the verified license grants full mode.
func (a *Agent) requireFull() error {
	if devBypass && os.Getenv("BAKVION_DEV_UNLICENSED") == "1" {
		return nil
	}
	st, err := a.AccountStatus()
	if err != nil {
		return err
	}
	if st.Mode != license.ModeFull {
		return ErrMembershipInactive
	}
	return nil
}

// SignIn exchanges a password or a one-time code for a device session. The
// returned license is verified before anything is saved; the response mode is ignored.
func (a *Agent) SignIn(ctx context.Context, method, username, password, code string) (AccountStatus, error) {
	req := cloud.SignInRequest{Method: method}
	switch method {
	case "password":
		if username == "" || password == "" {
			return AccountStatus{}, errors.New("username and password are required")
		}
		req.Username, req.Password = username, password
	case "code":
		if code == "" {
			return AccountStatus{}, errors.New("login code is required")
		}
		req.Code = code
	default:
		return AccountStatus{}, errors.New("unsupported sign-in method")
	}
	if a.Cloud == nil {
		return AccountStatus{}, errNoCloud
	}
	row, err := a.Store.account()
	if err != nil {
		return AccountStatus{}, err
	}
	machine, windows := a.machineInfo()
	req.Device = cloud.DeviceInfo{InstallID: row.InstallID, MachineName: clip(machine, 64), WindowsVersion: clip(windows, 64), AppVersion: clip(a.AppVersion, 32)}
	res, err := a.Cloud.SignIn(ctx, req)
	if err != nil {
		return AccountStatus{}, err
	}
	p, err := license.Verify(res.License, a.LicenseKey)
	if err != nil || res.DeviceToken == "" {
		return AccountStatus{}, errInvalidLicense
	}
	now := a.clock()
	if err = a.Store.saveSession(res.DeviceToken, res.License, now, syncHighWater(p, now)); err != nil {
		return AccountStatus{}, err
	}
	return a.AccountStatus()
}

// SignOut clears the local session first, then revokes the token on the server
// best-effort (it succeeds offline). Plans and history are untouched.
func (a *Agent) SignOut(ctx context.Context) error {
	row, err := a.Store.account()
	if err != nil {
		return err
	}
	if err = a.Store.clearSession(""); err != nil {
		return err
	}
	if row.DeviceToken != "" && a.Cloud != nil {
		_ = a.Cloud.SignOut(ctx, row.DeviceToken)
	}
	return nil
}

// Refresh fetches a new license. Without a session it does nothing. A removed
// device or rejected token signs this PC out; offline and other errors keep everything.
func (a *Agent) Refresh(ctx context.Context) error {
	row, err := a.Store.account()
	if err != nil {
		return err
	}
	if row.DeviceToken == "" {
		return nil
	}
	if a.Cloud == nil {
		return errNoCloud
	}
	token, err := a.Cloud.RefreshLicense(ctx, row.DeviceToken, clip(a.AppVersion, 32))
	if err != nil {
		var apiErr *cloud.APIError
		if errors.As(err, &apiErr) && (apiErr.Code == "device_removed" || apiErr.Code == "unauthorized") {
			if clearErr := a.Store.clearSession(row.DeviceToken); clearErr != nil {
				return clearErr
			}
		}
		return err
	}
	p, err := license.Verify(token, a.LicenseKey)
	if err != nil {
		return errInvalidLicense
	}
	now := a.clock()
	return a.Store.saveLicense(row.DeviceToken, token, now, syncHighWater(p, now))
}

// licenseTick runs one refresh and returns the wait before the next one.
func (a *Agent) licenseTick(ctx context.Context) time.Duration {
	if err := a.Refresh(ctx); err != nil {
		return licenseRetryInterval
	}
	return licenseRefreshInterval
}

// LicenseLoop refreshes now, then every 6 h after success or 5 min after failure, until ctx ends.
func (a *Agent) LicenseLoop(ctx context.Context) {
	for {
		timer := time.NewTimer(a.licenseTick(ctx))
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
	}
}

func (a *Agent) handleAccount(ctx context.Context, r Request) (any, error) {
	switch r.Method {
	case "accountStatus":
		return a.AccountStatus()
	case "signIn":
		var p struct {
			Method   string `json:"method"`
			Username string `json:"username"`
			Password string `json:"password"`
			Code     string `json:"code"`
		}
		if err := decode(r.Params, &p); err != nil {
			return nil, errors.New("invalid sign-in parameters")
		}
		return a.SignIn(ctx, p.Method, p.Username, p.Password, p.Code)
	case "signOut":
		if err := a.SignOut(ctx); err != nil {
			return nil, err
		}
		return a.AccountStatus()
	case "refreshLicense":
		if err := a.Refresh(ctx); err != nil {
			return nil, err
		}
		return a.AccountStatus()
	}
	return nil, errors.New("unsupported method")
}

// errorCode maps an error to its pipe code.
func errorCode(err error) string {
	var apiErr *cloud.APIError
	switch {
	case errors.Is(err, ErrMembershipInactive):
		return CodeMembershipInactive
	case errors.As(err, &apiErr) && apiErr.Code != "":
		return strings.ToUpper(apiErr.Code)
	case errors.Is(err, cloud.ErrOffline):
		return CodeOffline
	}
	return CodeOperationFailed
}
