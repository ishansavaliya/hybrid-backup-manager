package license

import (
	"crypto/ed25519"
	"encoding/base64"
	"errors"
)

// PublicKeyBase64 is the raw 32-byte Ed25519 license public key, standard
// base64. Overridable at build time with -ldflags "-X .../license.PublicKeyBase64=...".
var PublicKeyBase64 = "mzFM3o7JtiCsRWwi1IiNDVDCpXk74TRRhru/GLuWQAs="

// DefaultPublicKey decodes PublicKeyBase64; it errors when empty or not 32 bytes.
func DefaultPublicKey() (ed25519.PublicKey, error) {
	if PublicKeyBase64 == "" {
		return nil, errors.New("license: public key not configured")
	}
	b, err := base64.StdEncoding.DecodeString(PublicKeyBase64)
	if err != nil {
		return nil, errors.New("license: public key is not valid base64")
	}
	if len(b) != ed25519.PublicKeySize {
		return nil, errors.New("license: public key must be 32 bytes")
	}
	return ed25519.PublicKey(b), nil
}
