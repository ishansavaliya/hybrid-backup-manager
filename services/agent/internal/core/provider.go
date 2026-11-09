package core

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
)

// StorageProvider is a provider extension contract. Restic remains the sole
// authority for repository object layout, encryption, locks and deletion.
// OAuth and remote providers are not enabled by implementing this interface alone.
type StorageProvider interface {
	Capabilities() ProviderCapabilities
	Connect(context.Context) error
	TestConnection(context.Context) error
	Upload(context.Context, string, io.Reader) error
	Download(context.Context, string, io.Writer) error
	List(context.Context, string) ([]StorageObject, error)
	Delete(context.Context, string, DeleteAuthorization) error
	Quota(context.Context) (StorageQuota, error)
	Refresh(context.Context) error
}
type ProviderCapabilities struct {
	Kind                 string
	Resume, Quota, OAuth bool
}
type StorageObject struct {
	Key  string
	Size int64
}
type StorageQuota struct{ Capacity, Available int64 }
type DeleteAuthorization struct{ RepositoryID, OperationID string }

var ErrUnsupported = errors.New("provider capability is not implemented or validated")

// TestLocalDestination uses a uniquely created probe, flushes and reads it back,
// then deletes only that probe. It does not imply repository integrity or durability.
func TestLocalDestination(ctx context.Context, d Destination) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	path, err := canonical(d.Repository)
	if err != nil {
		return err
	}
	if _, err = os.Stat(path); os.IsNotExist(err) {
		path = filepath.Dir(path)
	} else if err != nil {
		return err
	}
	f, err := os.CreateTemp(path, ".bakvion-probe-")
	if err != nil {
		return errors.New("destination write probe failed")
	}
	name := f.Name()
	defer os.Remove(name)
	defer f.Close()
	probe := []byte("Bakvion connection test\n")
	if _, err = f.Write(probe); err != nil {
		return err
	}
	if err = f.Sync(); err != nil {
		return err
	}
	if _, err = f.Seek(0, 0); err != nil {
		return err
	}
	b, err := io.ReadAll(f)
	if err != nil {
		return err
	}
	if string(b) != string(probe) {
		return errors.New("destination read-back mismatch")
	}
	if err = f.Close(); err != nil {
		return err
	}
	return os.Remove(name)
}
