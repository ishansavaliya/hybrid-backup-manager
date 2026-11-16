package update

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func signed(t *testing.T, priv ed25519.PrivateKey, m Manifest) Manifest {
	t.Helper()
	m.Signature = base64.StdEncoding.EncodeToString(ed25519.Sign(priv, []byte(message(m))))
	return m
}

func TestNewer(t *testing.T) {
	cases := []struct {
		a, b string
		want bool
	}{
		{"0.2.0", "0.1.9", true}, {"1.0.0", "0.99.99", true}, {"0.10.0", "0.9.0", true},
		{"0.1.0", "0.1.0", false}, {"0.1.0", "0.2.0", false},
		{"0.2.0", "dev", false}, {"0.2.0", "", false}, {"v0.2.0", "0.1.0", false},
	}
	for _, c := range cases {
		if got := Newer(c.a, c.b); got != c.want {
			t.Errorf("Newer(%q,%q)=%v", c.a, c.b, got)
		}
	}
}

func TestLatestAndDownloadVerifyEverything(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	installer := []byte(strings.Repeat("MZ installer bytes ", 1000))
	sum := sha256.Sum256(installer)
	var manifest Manifest
	tampered := false
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/latest.json":
			_ = json.NewEncoder(w).Encode(manifest)
		case "/setup.exe":
			b := installer
			if tampered {
				b = append([]byte{}, installer...)
				b[0] = 'X'
			}
			_, _ = w.Write(b)
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	manifest = signed(t, priv, Manifest{Version: "0.2.0", URL: srv.URL + "/setup.exe", SHA256: hex.EncodeToString(sum[:]), Size: int64(len(installer))})
	c := Client{HTTP: srv.Client(), ManifestURL: srv.URL + "/latest.json", PublicKey: pub, Dir: t.TempDir()}

	m, err := c.Latest(context.Background())
	if err != nil || m.Version != "0.2.0" {
		t.Fatalf("latest: %+v %v", m, err)
	}
	path, err := c.Download(context.Background(), m)
	if err != nil {
		t.Fatalf("download: %v", err)
	}
	if b, _ := os.ReadFile(path); string(b) != string(installer) {
		t.Fatal("installer content differs")
	}

	// A tampered installer is rejected and never left behind.
	if err = os.Remove(path); err != nil {
		t.Fatal(err)
	}
	tampered = true
	if _, err = c.Download(context.Background(), m); err == nil {
		t.Fatal("tampered installer accepted")
	}
	if entries, _ := os.ReadDir(c.Dir); len(entries) != 0 {
		t.Fatalf("left files: %v", entries)
	}

	// Any change to the signed fields breaks the signature.
	for _, edit := range []func(*Manifest){
		func(m *Manifest) { m.Version = "9.9.9" },
		func(m *Manifest) { m.URL = srv.URL + "/evil.exe" },
		func(m *Manifest) { m.Size++ },
	} {
		bad := manifest
		edit(&bad)
		manifest = bad
		if _, err = c.Latest(context.Background()); err == nil {
			t.Fatal("edited manifest accepted")
		}
		manifest = signed(t, priv, Manifest{Version: "0.2.0", URL: srv.URL + "/setup.exe", SHA256: hex.EncodeToString(sum[:]), Size: int64(len(installer))})
	}
	other, _, _ := ed25519.GenerateKey(rand.Reader)
	c.PublicKey = other
	if _, err = c.Latest(context.Background()); err != ErrSig {
		t.Fatalf("other key: %v", err)
	}
	insecure := signed(t, priv, Manifest{Version: "0.2.0", URL: "http://x/setup.exe", SHA256: hex.EncodeToString(sum[:]), Size: 10})
	if Verify(insecure, pub) == nil {
		t.Fatal("http URL accepted")
	}
}

func TestEmbeddedPublicKey(t *testing.T) {
	if _, err := PublicKey(); err != nil {
		t.Fatal(err)
	}
}
