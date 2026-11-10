// Package cloud talks to the Bakvion web server's device API
// (apps/web/app/api/v1/device/*). It never logs tokens or passwords.
package cloud

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

// DefaultBaseURL is the server origin. Overridable at build time with
// -ldflags "-X .../cloud.DefaultBaseURL=https://...".
var DefaultBaseURL = "http://localhost:3000"

// ErrOffline wraps network failures, timeouts and 5xx responses.
var ErrOffline = errors.New("server unreachable")

const (
	requestTimeout = 20 * time.Second
	maxBody        = 1 << 20
	maxMessage     = 300
)

type DeviceInfo struct {
	InstallID      string `json:"installId"`
	MachineName    string `json:"machineName"`
	WindowsVersion string `json:"windowsVersion"`
	AppVersion     string `json:"appVersion"`
}

// SignInRequest is either Method "password" (Username, Password) or "code" (Code).
type SignInRequest struct {
	Method   string     `json:"method"`
	Username string     `json:"username,omitempty"`
	Password string     `json:"password,omitempty"`
	Code     string     `json:"code,omitempty"`
	Device   DeviceInfo `json:"device"`
}

type SignInResult struct {
	DeviceToken string `json:"deviceToken"`
	License     string `json:"license"`
	Mode        string `json:"mode"`
}

// APIError is a 4xx response {error:{code,message}} from the server.
type APIError struct {
	Status  int
	Code    string
	Message string
}

func (e *APIError) Error() string {
	if e.Message != "" {
		return e.Message
	}
	return e.Code
}

type Client struct {
	BaseURL string
	HTTP    *http.Client
}

var errorCode = regexp.MustCompile(`^[a-z][a-z0-9_]{0,39}$`)

func (c *Client) SignIn(ctx context.Context, r SignInRequest) (SignInResult, error) {
	var out SignInResult
	if err := c.post(ctx, "/api/v1/device/sign-in", "", r, &out); err != nil {
		return SignInResult{}, err
	}
	if out.DeviceToken == "" || out.License == "" {
		return SignInResult{}, errors.New("cloud: incomplete sign-in response")
	}
	return out, nil
}

// RefreshLicense returns a freshly signed license token for the device token.
func (c *Client) RefreshLicense(ctx context.Context, token, appVersion string) (string, error) {
	var out struct {
		License string `json:"license"`
	}
	if err := c.post(ctx, "/api/v1/device/license", token, map[string]string{"appVersion": appVersion}, &out); err != nil {
		return "", err
	}
	if out.License == "" {
		return "", errors.New("cloud: incomplete license response")
	}
	return out.License, nil
}

func (c *Client) SignOut(ctx context.Context, token string) error {
	var out struct {
		OK bool `json:"ok"`
	}
	return c.post(ctx, "/api/v1/device/sign-out", token, struct{}{}, &out)
}

func (c *Client) post(ctx context.Context, path, token string, in, out any) error {
	body, err := json.Marshal(in)
	if err != nil {
		return err
	}
	base := c.BaseURL
	if base == "" {
		base = DefaultBaseURL
	}
	ctx, cancel := context.WithTimeout(ctx, requestTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(base, "/")+path, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("cloud: invalid server address: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	hc := c.HTTP
	if hc == nil {
		hc = &http.Client{Timeout: requestTimeout}
	}
	res, err := hc.Do(req)
	if err != nil {
		// *url.Error carries only method and URL, never headers or body.
		return fmt.Errorf("%w: %v", ErrOffline, err)
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(res.Body, maxBody))
	if err != nil {
		return fmt.Errorf("%w: %v", ErrOffline, err)
	}
	switch {
	case res.StatusCode >= 500:
		return fmt.Errorf("%w (HTTP %d)", ErrOffline, res.StatusCode)
	case res.StatusCode >= 400:
		return decodeAPIError(res.StatusCode, raw)
	case res.StatusCode < 200 || res.StatusCode > 299:
		return fmt.Errorf("cloud: unexpected HTTP status %d", res.StatusCode)
	}
	if err = json.Unmarshal(raw, out); err != nil {
		return errors.New("cloud: invalid server response")
	}
	return nil
}

func decodeAPIError(status int, raw []byte) error {
	var body struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if json.Unmarshal(raw, &body) != nil || !errorCode.MatchString(body.Error.Code) {
		return &APIError{Status: status, Code: "http_error", Message: fmt.Sprintf("Unexpected server response (HTTP %d).", status)}
	}
	msg := body.Error.Message
	if len(msg) > maxMessage {
		msg = strings.ToValidUTF8(msg[:maxMessage], "")
	}
	return &APIError{Status: status, Code: body.Error.Code, Message: msg}
}

// LeadRequest is a "Connect with Bakvion experts" enquiry from the app.
type LeadRequest struct {
	Name       string `json:"name"`
	Business   string `json:"business"`
	Phone      string `json:"phone"`
	Email      string `json:"email,omitempty"`
	City       string `json:"city,omitempty"`
	PCs        int    `json:"pcs,omitempty"`
	Message    string `json:"message,omitempty"`
	Source     string `json:"source"`
	InstallID  string `json:"installId,omitempty"`
	AppVersion string `json:"appVersion,omitempty"`
}

// SubmitLead sends an enquiry; no account or token is needed.
func (c *Client) SubmitLead(ctx context.Context, r LeadRequest) error {
	var out struct {
		OK bool `json:"ok"`
	}
	return c.post(ctx, "/api/v1/leads", "", r, &out)
}

// ReportSettings are the client's email-report choices for this PC.
type ReportSettings struct {
	Emails []string `json:"emails"`
	Mode   string   `json:"mode"`
}

// Report is one finished backup run, sent so the server can email it.
type Report struct {
	RunID           string `json:"runId"`
	PlanName        string `json:"planName"`
	DestinationName string `json:"destinationName"`
	ScheduleKind    string `json:"scheduleKind"`
	State           string `json:"state"`
	StartedAt       string `json:"startedAt"`
	FinishedAt      string `json:"finishedAt"`
	Error           string `json:"error"`
	Notes           string `json:"notes"`
}

// ReportBatch carries the current settings with any waiting reports. Test
// asks the server for a test email to the configured addresses.
type ReportBatch struct {
	Settings ReportSettings `json:"settings"`
	Reports  []Report       `json:"reports"`
	Test     bool           `json:"test,omitempty"`
}

// SubmitReports delivers a batch with the device token.
func (c *Client) SubmitReports(ctx context.Context, token string, b ReportBatch) error {
	var out struct {
		OK bool `json:"ok"`
	}
	return c.post(ctx, "/api/v1/device/reports", token, b, &out)
}
