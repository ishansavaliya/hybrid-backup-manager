//go:build !windows

package core

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"errors"
	"os"
	"path/filepath"
)

// fileKeySealer is the non-Windows stand-in for DPAPI (development and
// tests): AES-256-GCM with a random key in a 0600 file next to the state.
type fileKeySealer struct{ aead cipher.AEAD }

func defaultSealer(statePath string) (Sealer, error) {
	path := filepath.Join(filepath.Dir(statePath), "keys.secret")
	key, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		key = make([]byte, 32)
		if _, err = rand.Read(key); err != nil {
			return nil, err
		}
		if err = os.WriteFile(path, key, 0o600); err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	}
	if len(key) != 32 {
		return nil, errors.New("key file has the wrong size")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return fileKeySealer{aead}, nil
}

func (s fileKeySealer) Seal(plain []byte) ([]byte, error) {
	nonce := make([]byte, s.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	return s.aead.Seal(nonce, nonce, plain, nil), nil
}

func (s fileKeySealer) Open(sealed []byte) ([]byte, error) {
	n := s.aead.NonceSize()
	if len(sealed) < n {
		return nil, errors.New("sealed key too short")
	}
	return s.aead.Open(nil, sealed[:n], sealed[n:], nil)
}
