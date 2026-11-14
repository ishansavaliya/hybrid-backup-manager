// Package xcheck is a release gate: CI points MANIFEST at the freshly signed
// latest.json and this proves the app's embedded public key accepts it.
package xcheck

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/ishansavaliya/hybrid-backup-manager/services/agent/internal/update"
)

func TestReleaseManifestVerifies(t *testing.T) {
	path := os.Getenv("MANIFEST")
	if path == "" {
		t.Skip("set MANIFEST to a signed latest.json (release pipeline)")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var m update.Manifest
	if err = json.Unmarshal(raw, &m); err != nil {
		t.Fatal(err)
	}
	if key := os.Getenv("PUB"); key != "" {
		update.PublicKeyBase64 = key
	}
	pub, err := update.PublicKey()
	if err != nil {
		t.Fatal(err)
	}
	if err = update.Verify(m, pub); err != nil {
		t.Fatal(err)
	}
	if want := os.Getenv("VERSION"); want != "" && m.Version != want {
		t.Fatalf("manifest version %s, want %s", m.Version, want)
	}
}
