package core

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"sync"
	"testing"
	"time"

	"github.com/ishansavaliya/hybrid-backup-manager/services/agent/internal/cloud"
	"github.com/ishansavaliya/hybrid-backup-manager/services/agent/internal/license"
)

// testDeviceToken is an opaque fake device token; it never reaches a real server.
const testDeviceToken = "test-device-token-0000000000000000000000000"

type testClock struct {
	mu sync.Mutex
	t  time.Time
}

func newTestClock(t time.Time) *testClock { return &testClock{t: t} }
func (c *testClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}
func (c *testClock) Set(t time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.t = t
}
func (c *testClock) Add(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.t = c.t.Add(d)
}

// fakeCloud stands in for cloud.Client. It signs licenses with a test key and
// stamps issuedAt with the agent's clock, like a server whose time matches.
type fakeCloud struct {
	mu         sync.Mutex
	priv       ed25519.PrivateKey
	now        func() time.Time
	expiresAt  time.Time
	status     string
	mode       string
	bodyMode   string
	signInErr  error
	refreshErr error
	signOutErr error
	badLicense string
	clientID   string // "" means "client-1"
	deviceID   string // "" means "device-1"
	onRefresh  func()
	signIns    []cloud.SignInRequest
	refreshes  []string
	signOuts   []string
}

func signTestLicense(priv ed25519.PrivateKey, p license.Payload) string {
	raw, err := json.Marshal(p)
	if err != nil {
		panic(err)
	}
	enc := base64.RawURLEncoding
	return enc.EncodeToString(raw) + "." + enc.EncodeToString(ed25519.Sign(priv, raw))
}
func (f *fakeCloud) license() string {
	if f.badLicense != "" {
		return f.badLicense
	}
	clientID, deviceID := f.clientID, f.deviceID
	if clientID == "" {
		clientID = "client-1"
	}
	if deviceID == "" {
		deviceID = "device-1"
	}
	return signTestLicense(f.priv, license.Payload{
		V: 1, ClientID: clientID, ClientName: "Acme Traders", DeviceID: deviceID,
		Status: f.status, Mode: f.mode, ExpiresAt: f.expiresAt, IssuedAt: f.now(),
		RenewContact: "support@example.com",
	})
}
func (f *fakeCloud) SignIn(_ context.Context, r cloud.SignInRequest) (cloud.SignInResult, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.signIns = append(f.signIns, r)
	if f.signInErr != nil {
		return cloud.SignInResult{}, f.signInErr
	}
	return cloud.SignInResult{DeviceToken: testDeviceToken, License: f.license(), Mode: f.bodyMode}, nil
}
func (f *fakeCloud) RefreshLicense(_ context.Context, token, _ string) (string, error) {
	f.mu.Lock()
	hook := f.onRefresh
	f.mu.Unlock()
	// The hook runs unlocked: it may call back into the agent (and so into this fake).
	if hook != nil {
		hook()
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.refreshes = append(f.refreshes, token)
	if f.refreshErr != nil {
		return "", f.refreshErr
	}
	return f.license(), nil
}
func (f *fakeCloud) SignOut(_ context.Context, token string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.signOuts = append(f.signOuts, token)
	return f.signOutErr
}

// accountAgent builds an Agent with a fake cloud, a test keypair and the given clock.
// The fake issues an active, full license expiring 365 days after the clock's time.
func accountAgent(t *testing.T, store *Store, engine Engine, clock func() time.Time) (*Agent, *fakeCloud) {
	t.Helper()
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	fake := &fakeCloud{priv: priv, now: clock, expiresAt: clock().Add(365 * 24 * time.Hour), status: "active", mode: "full", bodyMode: "full"}
	a := &Agent{
		Store: store, Engine: engine, Cloud: fake, LicenseKey: pub, Clock: clock, AppVersion: "0.1.0-test",
		MachineInfo: func() (string, string) { return "TEST-PC", "test-os" },
	}
	return a, fake
}

// licensedAgent returns an Agent that is signed in with a valid full license saved in store.
func licensedAgent(t *testing.T, store *Store, engine Engine) *Agent {
	t.Helper()
	a, _ := accountAgent(t, store, engine, time.Now)
	st, err := a.SignIn(context.Background(), "password", "acme", "test-password", "")
	if err != nil {
		t.Fatal(err)
	}
	if st.Mode != license.ModeFull {
		t.Fatalf("licensed agent not full: %+v", st)
	}
	return a
}
