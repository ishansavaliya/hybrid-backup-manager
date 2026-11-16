package license

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"
)

func signForTest(t *testing.T, priv ed25519.PrivateKey, p Payload) string {
	t.Helper()
	raw, err := json.Marshal(p)
	if err != nil {
		t.Fatal(err)
	}
	sig := ed25519.Sign(priv, raw)
	enc := base64.RawURLEncoding
	return enc.EncodeToString(raw) + "." + enc.EncodeToString(sig)
}

func newKey(t *testing.T) (ed25519.PublicKey, ed25519.PrivateKey) {
	t.Helper()
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return pub, priv
}

func basePayload(exp time.Time) Payload {
	return Payload{
		V: 1, ClientID: "c1", ClientName: "Acme", DeviceID: "d1",
		Status: "active", Mode: "full", ExpiresAt: exp,
		IssuedAt: exp.Add(-24 * time.Hour), RenewContact: "x@example.com",
	}
}

func TestVerifyRoundTrip(t *testing.T) {
	pub, priv := newKey(t)
	want := basePayload(time.Date(2030, 1, 1, 0, 0, 0, 0, time.UTC))
	got, err := Verify(signForTest(t, priv, want), pub)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if got.ClientID != want.ClientID || got.Mode != "full" || !got.ExpiresAt.Equal(want.ExpiresAt) {
		t.Fatalf("payload mismatch: %+v", got)
	}
}

func TestVerifyRejectsTamperedToken(t *testing.T) {
	pub, priv := newKey(t)
	tok := signForTest(t, priv, basePayload(time.Now().Add(time.Hour)))
	b := []byte(tok)
	if b[5] == 'A' {
		b[5] = 'B'
	} else {
		b[5] = 'A'
	}
	if _, err := Verify(string(b), pub); err == nil {
		t.Fatal("tampered payload verified")
	}
	parts := strings.Split(tok, ".")
	sig := []byte(parts[1])
	if sig[3] == 'A' {
		sig[3] = 'B'
	} else {
		sig[3] = 'A'
	}
	if _, err := Verify(parts[0]+"."+string(sig), pub); err == nil {
		t.Fatal("tampered signature verified")
	}
}

func TestVerifyRejectsOtherKeyAndMalformed(t *testing.T) {
	_, priv := newKey(t)
	other, _ := newKey(t)
	tok := signForTest(t, priv, basePayload(time.Now().Add(time.Hour)))
	if _, err := Verify(tok, other); err == nil {
		t.Fatal("other key verified")
	}
	for _, bad := range []string{"", "abc", "a.b.c", "!!!.???"} {
		if _, err := Verify(bad, other); err == nil {
			t.Fatalf("malformed %q verified", bad)
		}
	}
	if _, err := Verify(tok, ed25519.PublicKey([]byte{1, 2})); err == nil {
		t.Fatal("short public key accepted")
	}
}

func TestVerifyRejectsVersion2(t *testing.T) {
	pub, priv := newKey(t)
	p := basePayload(time.Now().Add(time.Hour))
	p.V = 2
	if _, err := Verify(signForTest(t, priv, p), pub); err == nil {
		t.Fatal("v2 accepted")
	}
}

func TestCrossLanguageVector(t *testing.T) {
	raw, err := os.ReadFile("testdata/vector.json")
	if err != nil {
		t.Fatal(err)
	}
	var vec struct {
		PublicKey string  `json:"publicKey"`
		Token     string  `json:"token"`
		Payload   Payload `json:"payload"`
	}
	if err := json.Unmarshal(raw, &vec); err != nil {
		t.Fatal(err)
	}
	pubBytes, err := base64.StdEncoding.DecodeString(vec.PublicKey)
	if err != nil {
		t.Fatal(err)
	}
	got, err := Verify(vec.Token, ed25519.PublicKey(pubBytes))
	if err != nil {
		t.Fatalf("vector verify: %v", err)
	}
	if got.ClientID != vec.Payload.ClientID || got.DeviceID != "dev-abc-123" ||
		got.Mode != "full" || got.Status != "active" ||
		!got.ExpiresAt.Equal(vec.Payload.ExpiresAt) || !got.IssuedAt.Equal(vec.Payload.IssuedAt) ||
		got.RenewContact != "support@example.com" {
		t.Fatalf("vector payload mismatch: %+v", got)
	}
}

func TestDefaultPublicKey(t *testing.T) {
	orig := PublicKeyBase64
	defer func() { PublicKeyBase64 = orig }()
	PublicKeyBase64 = ""
	if _, err := DefaultPublicKey(); err == nil {
		t.Fatal("empty key accepted")
	}
	PublicKeyBase64 = "!!!"
	if _, err := DefaultPublicKey(); err == nil {
		t.Fatal("invalid base64 accepted")
	}
	PublicKeyBase64 = base64.StdEncoding.EncodeToString([]byte("short"))
	if _, err := DefaultPublicKey(); err == nil {
		t.Fatal("short key accepted")
	}
	pub, _ := newKey(t)
	PublicKeyBase64 = base64.StdEncoding.EncodeToString(pub)
	got, err := DefaultPublicKey()
	if err != nil || !got.Equal(pub) {
		t.Fatalf("valid key rejected: %v", err)
	}
}

func TestEvaluate(t *testing.T) {
	now := time.Date(2026, 11, 10, 12, 0, 0, 0, time.UTC)
	mk := func(status, mode string, exp time.Time) *Payload {
		p := basePayload(exp)
		p.Status, p.Mode = status, mode
		return &p
	}
	tests := []struct {
		name      string
		p         *Payload
		high      time.Time
		mode      Mode
		reason    string
		days      int
		badge     bool
		hasExpiry bool
	}{
		{"nil signed out", nil, now, ModeSignedOut, "signed_out", 0, false, false},
		{"active 30d", mk("active", "full", now.Add(30*24*time.Hour)), now, ModeFull, "", 30, false, true},
		{"active 6d badge", mk("active", "full", now.Add(6*24*time.Hour)), now, ModeFull, "", 6, true, true},
		{"partial day rounds up", mk("active", "full", now.Add(5*24*time.Hour+time.Second)), now, ModeFull, "", 6, true, true},
		{"exactly 10d badge", mk("active", "full", now.Add(10*24*time.Hour)), now, ModeFull, "", 10, true, true},
		{"11d no badge", mk("active", "full", now.Add(10*24*time.Hour+time.Hour)), now, ModeFull, "", 11, false, true},
		{"expires exactly now still full", mk("active", "full", now), now, ModeFull, "", 0, true, true},
		{"expired 1s", mk("active", "full", now.Add(-time.Second)), now, ModeRestoreOnly, "expired", 0, false, true},
		{"blocked", mk("blocked", "full", now.Add(30*24*time.Hour)), now, ModeRestoreOnly, "blocked", 0, false, true},
		{"blocked and expired is blocked", mk("blocked", "full", now.Add(-time.Hour)), now, ModeRestoreOnly, "blocked", 0, false, true},
		{"clock 10 min back", mk("active", "full", now.Add(30*24*time.Hour)), now.Add(10 * time.Minute), ModeRestoreOnly, "clock", 0, false, true},
		{"clock 4 min back tolerated", mk("active", "full", now.Add(30*24*time.Hour)), now.Add(4 * time.Minute), ModeFull, "", 30, false, true},
		{"clock beats blocked", mk("blocked", "full", now.Add(time.Hour)), now.Add(10 * time.Minute), ModeRestoreOnly, "clock", 0, false, true},
		{"pc_limit", mk("active", "restore_only", now.Add(6*24*time.Hour)), now, ModeRestoreOnly, "pc_limit", 6, false, true},
		{"unknown status fails closed", mk("paused", "full", now.Add(30*24*time.Hour)), now, ModeRestoreOnly, "blocked", 0, false, true},
		{"unknown mode fails closed", mk("active", "turbo", now.Add(30*24*time.Hour)), now, ModeRestoreOnly, "pc_limit", 30, false, true},
		{"empty mode fails closed", mk("active", "", now.Add(30*24*time.Hour)), now, ModeRestoreOnly, "pc_limit", 30, false, true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			s := Evaluate(tc.p, now, tc.high)
			if s.Mode != tc.mode || s.Reason != tc.reason || s.DaysLeft != tc.days || s.ShowBadge != tc.badge {
				t.Fatalf("got %+v", s)
			}
			if tc.hasExpiry != (s.ExpiresAt != nil) {
				t.Fatalf("expiresAt presence: %+v", s)
			}
			if tc.hasExpiry && !s.ExpiresAt.Equal(tc.p.ExpiresAt) {
				t.Fatalf("expiresAt = %v", s.ExpiresAt)
			}
		})
	}
}
