package core

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// Sealer protects managed repository keys at rest (DPAPI on Windows).
type Sealer interface {
	Seal(plain []byte) ([]byte, error)
	Open(sealed []byte) ([]byte, error)
}

// ErrKeyMissing means a managed destination has no key yet (not set up).
var ErrKeyMissing = errors.New("this destination is not set up yet; click Set up first")

func (a *Agent) sealer() (Sealer, error) {
	if a.Sealer != nil {
		return a.Sealer, nil
	}
	s, err := defaultSealer(a.Store.Path)
	if err != nil {
		return nil, fmt.Errorf("key protection unavailable: %w", err)
	}
	a.Sealer = s
	return s, nil
}

func repoKey(repository string) (string, error) {
	repo, err := canonical(repository)
	if err != nil {
		return "", err
	}
	if runtime.GOOS == "windows" {
		repo = strings.ToLower(repo)
	}
	return repo, nil
}

// withKey resolves a destination's managed key; create generates one when
// absent (only while setting the destination up). Password-file
// destinations are returned unchanged.
func (a *Agent) withKey(d Destination, create bool) (Destination, error) {
	if d.PasswordFile != "" {
		return d, nil
	}
	repo, err := repoKey(d.Repository)
	if err != nil {
		return d, err
	}
	s, err := a.sealer()
	if err != nil {
		return d, err
	}
	var sealed []byte
	err = a.Store.DB.QueryRow(`SELECT sealed FROM destination_keys WHERE repository=?`, repo).Scan(&sealed)
	switch {
	case err == nil:
		plain, openErr := s.Open(sealed)
		if openErr != nil {
			return d, errors.New("cannot unlock this destination's key on this PC")
		}
		d.password = string(plain)
		return d, nil
	case !errors.Is(err, sql.ErrNoRows):
		return d, err
	case !create:
		return d, ErrKeyMissing
	}
	raw := make([]byte, 32)
	if _, err = rand.Read(raw); err != nil {
		return d, err
	}
	d.password = base64.RawURLEncoding.EncodeToString(raw)
	return d, a.storeKey(s, repo, d.password)
}

func (a *Agent) storeKey(s Sealer, repo, password string) error {
	sealed, err := s.Seal([]byte(password))
	if err != nil {
		return err
	}
	_, err = a.Store.DB.Exec(`INSERT INTO destination_keys(repository,sealed,created_at) VALUES(?,?,?) ON CONFLICT(repository) DO UPDATE SET sealed=excluded.sealed,created_at=excluded.created_at`, repo, sealed, stamp())
	return err
}

func (a *Agent) dropKey(d Destination) error {
	repo, err := repoKey(d.Repository)
	if err != nil {
		return err
	}
	_, err = a.Store.DB.Exec(`DELETE FROM destination_keys WHERE repository=?`, repo)
	return err
}

// SetUpDestination creates a managed key and initialises the repository. A
// key made here is removed again when init fails (for example, the folder
// already holds a backup made with another key), so it never lingers.
func (a *Agent) SetUpDestination(ctx context.Context, d Destination) error {
	existing, err := a.withKey(d, false)
	fresh := errors.Is(err, ErrKeyMissing)
	if err != nil && !fresh {
		return err
	}
	if !fresh {
		if _, snapErr := a.Engine.Snapshots(ctx, existing); snapErr == nil {
			if !DefaultEncrypted {
				hideResticDirs(d.Repository)
			}
			return nil
		}
	}
	if d, err = a.withKey(d, true); err != nil {
		return err
	}
	if err = a.Engine.Init(ctx, d); err != nil && fresh && d.PasswordFile == "" {
		if dropErr := a.dropKey(d); dropErr != nil {
			return fmt.Errorf("%w (and the unused key could not be removed: %v)", err, dropErr)
		}
	}
	return err
}

// ConnectDestination stores the key of an existing backup (from a recovery
// kit) after proving it opens the repository.
func (a *Agent) ConnectDestination(ctx context.Context, d Destination, key string) error {
	if d.PasswordFile != "" {
		return errors.New("this destination uses its own password file")
	}
	key = strings.TrimSpace(key)
	if len(key) < 8 || len(key) > 512 {
		return errors.New("enter the key exactly as it appears in the recovery kit")
	}
	d.password = key
	if _, err := a.Engine.Snapshots(ctx, d); err != nil {
		return errors.New("this key does not open the backup at that location")
	}
	repo, err := repoKey(d.Repository)
	if err != nil {
		return err
	}
	s, err := a.sealer()
	if err != nil {
		return err
	}
	return a.storeKey(s, repo, key)
}

// KitStatus tells the UI whether the recovery kit must be (re)saved.
type KitStatus struct {
	Needed  bool    `json:"needed"`
	SavedAt *string `json:"savedAt"`
}

func (a *Agent) setting(key string) (string, bool, error) {
	var v string
	err := a.Store.DB.QueryRow(`SELECT value FROM agent_settings WHERE key=?`, key).Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	return v, err == nil, err
}

func (a *Agent) setSetting(key, value string) error {
	_, err := a.Store.DB.Exec(`INSERT INTO agent_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, key, value)
	return err
}

// KitStatus: needed while any managed key was created after the last save.
func (a *Agent) KitStatus() (KitStatus, error) {
	var newest sql.NullString
	if err := a.Store.DB.QueryRow(`SELECT MAX(created_at) FROM destination_keys`).Scan(&newest); err != nil {
		return KitStatus{}, err
	}
	saved, ok, err := a.setting("kit_saved_at")
	if err != nil {
		return KitStatus{}, err
	}
	st := KitStatus{}
	if ok {
		st.SavedAt = &saved
	}
	st.Needed = newest.Valid && (!ok || newest.String > saved)
	return st, nil
}

// RecoveryKit lists everything needed to restore these backups on another PC.
func (a *Agent) RecoveryKit() (string, error) {
	plans, err := a.Store.Plans()
	if err != nil {
		return "", err
	}
	var b strings.Builder
	b.WriteString("BAKVION RECOVERY KIT\r\n")
	b.WriteString("Created: " + a.now().Format("2 Jan 2006 15:04 MST") + "\r\n\r\n")
	b.WriteString("Keep this file private and away from your backup disk.\r\n")
	b.WriteString("Without it, backups cannot be restored on another PC.\r\n")
	b.WriteString("To restore on a new PC: install Bakvion, then use Restore with these keys,\r\n")
	b.WriteString("or the offline tool: bakvion --repo <Location> --password-file <file containing Key> --snapshot <id> --target <new folder> recover\r\n")
	for _, p := range plans {
		for _, d := range p.Destinations {
			fmt.Fprintf(&b, "\r\nPlan:        %s\r\nDestination: %s\r\nLocation:    %s\r\n", p.Name, d.Name, d.Repository)
			if d.PasswordFile != "" {
				fmt.Fprintf(&b, "Key:         your own password file (%s)\r\n", d.PasswordFile)
				continue
			}
			resolved, keyErr := a.withKey(d, false)
			switch {
			case errors.Is(keyErr, ErrKeyMissing):
				b.WriteString("Key:         (not set up yet)\r\n")
			case keyErr != nil:
				return "", keyErr
			default:
				fmt.Fprintf(&b, "Key:         %s\r\n", resolved.password)
			}
		}
	}
	// Keys of backups whose plan was deleted: the backup is still on its disk.
	used := map[string]bool{}
	for _, p := range plans {
		for _, d := range p.Destinations {
			if k, err := repoKey(d.Repository); err == nil {
				used[k] = true
			}
		}
	}
	rows, err := a.Store.DB.Query(`SELECT repository,sealed FROM destination_keys ORDER BY created_at`)
	if err != nil {
		return "", err
	}
	defer rows.Close()
	for rows.Next() {
		var repo string
		var sealed []byte
		if err = rows.Scan(&repo, &sealed); err != nil {
			return "", err
		}
		if used[repo] {
			continue
		}
		s, err := a.sealer()
		if err != nil {
			return "", err
		}
		plain, err := s.Open(sealed)
		if err != nil {
			return "", errors.New("cannot unlock a backup key on this PC")
		}
		fmt.Fprintf(&b, "\r\nPlan:        (deleted plan)\r\nLocation:    %s\r\nKey:         %s\r\n", repo, plain)
	}
	if err = rows.Err(); err != nil {
		return "", err
	}
	return b.String(), nil
}

// ExportRecoveryKit writes the kit as a new private file in dir.
func (a *Agent) ExportRecoveryKit(dir string) (string, error) {
	if !filepath.IsAbs(dir) {
		return "", errors.New("choose a folder for the recovery kit")
	}
	info, err := os.Stat(dir)
	if err != nil || !info.IsDir() {
		return "", errors.New("recovery kit folder unavailable")
	}
	kit, err := a.RecoveryKit()
	if err != nil {
		return "", err
	}
	path := filepath.Join(dir, "Bakvion-Recovery-Kit-"+a.now().Format("2006-01-02-1504")+".txt")
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return "", errors.New("could not create the recovery kit file there")
	}
	if _, err = f.WriteString(kit); err != nil {
		f.Close()
		return "", err
	}
	if err = f.Close(); err != nil {
		return "", err
	}
	return path, a.setSetting("kit_saved_at", stamp())
}

// stamp is a fixed-width UTC time, so stored values compare as strings.
func stamp() string { return time.Now().UTC().Format("2006-01-02T15:04:05.000000000Z") }

func (a *Agent) now() time.Time {
	if a.Clock != nil {
		return a.Clock()
	}
	return time.Now()
}
