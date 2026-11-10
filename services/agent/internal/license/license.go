// Package license verifies Ed25519-signed license tokens issued by the Bakvion
// web server and decides whether this PC may run new backups.
package license

import (
	"bytes"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

// Payload mirrors LicensePayload in apps/web/lib/server/license.ts.
type Payload struct {
	V            int       `json:"v"`
	ClientID     string    `json:"clientId"`
	ClientName   string    `json:"clientName"`
	DeviceID     string    `json:"deviceId"`
	Status       string    `json:"status"`
	Mode         string    `json:"mode"`
	ExpiresAt    time.Time `json:"expiresAt"`
	IssuedAt     time.Time `json:"issuedAt"`
	RenewContact string    `json:"renewContact"`
}

var errInvalid = errors.New("license: invalid token")

// Verify checks a token of the form base64url(JSON).base64url(signature)
// (no padding) against pub and returns the decoded payload.
func Verify(token string, pub ed25519.PublicKey) (Payload, error) {
	var p Payload
	if len(pub) != ed25519.PublicKeySize {
		return p, errors.New("license: invalid public key")
	}
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return p, errInvalid
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return p, errInvalid
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return p, errInvalid
	}
	if !ed25519.Verify(pub, raw, sig) {
		return p, errors.New("license: signature mismatch")
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	if err := dec.Decode(&p); err != nil {
		return Payload{}, errInvalid
	}
	if p.V != 1 {
		return Payload{}, errors.New("license: unsupported version")
	}
	return p, nil
}
