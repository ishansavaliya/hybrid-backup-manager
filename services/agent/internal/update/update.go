// Package update finds, verifies and downloads new Bakvion releases.
//
// A release publishes latest.json: version, installer URL, SHA-256, size and
// an Ed25519 signature over all of them (scripts/sign-update.mjs). Nothing is
// trusted until the signature verifies with the embedded public key, and the
// installer must then match the signed size and hash exactly.
package update

import (
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// PublicKeyBase64 verifies update manifests (raw 32-byte Ed25519 key).
// Overridable with -ldflags "-X .../update.PublicKeyBase64=...".
var PublicKeyBase64 = "ysMY2axfe8432UeTwCxULyCUFzDtw2JSIO49c9xg5aU="

// ManifestURL always points at the newest release.
var ManifestURL = "https://github.com/ishansavaliya/bakvion-releases/releases/latest/download/latest.json"

const (
	maxManifest  = 64 << 10
	maxInstaller = 500 << 20
	timeout      = 10 * time.Minute
)

// Manifest describes one release.
type Manifest struct {
	Version   string `json:"version"`
	URL       string `json:"url"`
	SHA256    string `json:"sha256"`
	Size      int64  `json:"size"`
	Signature string `json:"signature"`
}

var (
	semver   = regexp.MustCompile(`^\d+\.\d+\.\d+$`)
	hexHash  = regexp.MustCompile(`^[0-9a-f]{64}$`)
	ErrSig   = errors.New("update: signature does not verify")
	ErrShape = errors.New("update: invalid release information")
)

// message is the signed text; scripts/sign-update.mjs builds the same.
func message(m Manifest) string {
	return fmt.Sprintf("bakvion-update-v1\n%s\n%s\n%s\n%d", m.Version, m.URL, m.SHA256, m.Size)
}

// PublicKey decodes PublicKeyBase64.
func PublicKey() (ed25519.PublicKey, error) {
	b, err := base64.StdEncoding.DecodeString(PublicKeyBase64)
	if err != nil || len(b) != ed25519.PublicKeySize {
		return nil, errors.New("update: public key not configured")
	}
	return ed25519.PublicKey(b), nil
}

// Verify checks the manifest's shape and signature.
func Verify(m Manifest, pub ed25519.PublicKey) error {
	if !semver.MatchString(m.Version) || !strings.HasPrefix(m.URL, "https://") || !hexHash.MatchString(m.SHA256) || m.Size <= 0 || m.Size > maxInstaller {
		return ErrShape
	}
	sig, err := base64.StdEncoding.DecodeString(m.Signature)
	if err != nil || !ed25519.Verify(pub, []byte(message(m)), sig) {
		return ErrSig
	}
	return nil
}

func parts(v string) ([3]int, bool) {
	var out [3]int
	if !semver.MatchString(v) {
		return out, false
	}
	for i, p := range strings.Split(v, ".") {
		n, err := strconv.Atoi(p)
		if err != nil {
			return out, false
		}
		out[i] = n
	}
	return out, true
}

// Newer reports whether candidate is a higher X.Y.Z than current. Anything
// that is not X.Y.Z (a development build) is never replaced automatically.
func Newer(candidate, current string) bool {
	a, okA := parts(candidate)
	b, okB := parts(current)
	if !okA || !okB {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return a[i] > b[i]
		}
	}
	return false
}

// Client talks to the release host.
type Client struct {
	HTTP        *http.Client
	ManifestURL string
	PublicKey   ed25519.PublicKey
	// Dir receives downloaded installers; it must be writable only by the service.
	Dir string
}

func (c Client) http() *http.Client {
	if c.HTTP != nil {
		return c.HTTP
	}
	return &http.Client{Timeout: timeout}
}

func (c Client) get(ctx context.Context, url string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Bakvion-Updater")
	res, err := c.http().Do(req)
	if err != nil {
		return nil, fmt.Errorf("update: offline: %w", err)
	}
	if res.StatusCode != http.StatusOK {
		res.Body.Close()
		return nil, fmt.Errorf("update: server answered HTTP %d", res.StatusCode)
	}
	return res, nil
}

// Latest fetches and verifies the newest release's manifest.
func (c Client) Latest(ctx context.Context) (Manifest, error) {
	url := c.ManifestURL
	if url == "" {
		url = ManifestURL
	}
	res, err := c.get(ctx, url)
	if err != nil {
		return Manifest{}, err
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(res.Body, maxManifest))
	if err != nil {
		return Manifest{}, fmt.Errorf("update: offline: %w", err)
	}
	var m Manifest
	if err = json.Unmarshal(raw, &m); err != nil {
		return Manifest{}, ErrShape
	}
	return m, Verify(m, c.PublicKey)
}

// Download saves the installer and returns its path once size and SHA-256
// match the signed manifest. A matching earlier download is reused.
func (c Client) Download(ctx context.Context, m Manifest) (string, error) {
	if err := Verify(m, c.PublicKey); err != nil {
		return "", err
	}
	if c.Dir == "" {
		return "", errors.New("update: no download folder")
	}
	if err := os.MkdirAll(c.Dir, 0o700); err != nil {
		return "", err
	}
	target := filepath.Join(c.Dir, "Bakvion-Setup-"+m.Version+".exe")
	if ok, _ := matches(target, m); ok {
		return target, nil
	}
	res, err := c.get(ctx, m.URL)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	tmp, err := os.CreateTemp(c.Dir, "download-*.tmp")
	if err != nil {
		return "", err
	}
	defer os.Remove(tmp.Name())
	h := sha256.New()
	n, err := io.Copy(io.MultiWriter(tmp, h), io.LimitReader(res.Body, m.Size+1))
	if closeErr := tmp.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return "", fmt.Errorf("update: offline: %w", err)
	}
	if n != m.Size || hex.EncodeToString(h.Sum(nil)) != m.SHA256 {
		return "", errors.New("update: downloaded installer does not match the signed release")
	}
	if err = os.Rename(tmp.Name(), target); err != nil {
		return "", err
	}
	return target, nil
}

func matches(path string, m Manifest) (bool, error) {
	f, err := os.Open(path)
	if err != nil {
		return false, err
	}
	defer f.Close()
	h := sha256.New()
	n, err := io.Copy(h, io.LimitReader(f, m.Size+1))
	return err == nil && n == m.Size && hex.EncodeToString(h.Sum(nil)) == m.SHA256, err
}

// Launch starts the silent installer and returns without waiting: the
// installer stops and replaces this service. The file must still match sha.
func (c Client) Launch(installer, sha string) error { return launch(installer, sha) }
