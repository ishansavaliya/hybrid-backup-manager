package core

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
)

// ErrRestoreOnlyPlan refuses backups to (or edits of) a backup opened from another PC.
var ErrRestoreOnlyPlan = errors.New("this backup was opened for restore only; create a new plan to back up this PC")

// OpenExistingBackup adds a backup made on another PC (for example after the
// old PC broke) as a restore-only plan, using the key from the recovery kit.
// It works in restore-only membership: restoring old backups is always allowed.
func (a *Agent) OpenExistingBackup(ctx context.Context, name, repository, key string) (Plan, error) {
	name = strings.TrimSpace(name)
	if name == "" || len(name) > 120 {
		return Plan{}, errors.New("enter a name for this backup")
	}
	if !filepath.IsAbs(repository) {
		return Plan{}, errors.New("choose the backup folder")
	}
	repo, err := canonical(repository)
	if err != nil {
		return Plan{}, err
	}
	// Accept the folder that holds BakvionRepository as well as the repository itself.
	if _, err = os.Stat(filepath.Join(repo, "config")); err != nil {
		inner := filepath.Join(repo, "BakvionRepository")
		if _, innerErr := os.Stat(filepath.Join(inner, "config")); innerErr != nil {
			return Plan{}, errors.New("no Bakvion backup found in that folder")
		}
		repo = inner
	}
	wanted, err := repoKey(repo)
	if err != nil {
		return Plan{}, err
	}
	plans, err := a.Store.Plans()
	if err != nil {
		return Plan{}, err
	}
	for _, p := range plans {
		for _, d := range p.Destinations {
			if k, keyErr := repoKey(d.Repository); keyErr == nil && k == wanted {
				return Plan{}, errors.New("this backup is already in your plans (" + p.Name + ")")
			}
		}
	}
	d := Destination{ID: "backup", Name: name, Repository: repo}
	if err = a.ConnectDestination(ctx, d, key); err != nil {
		return Plan{}, err
	}
	p := Plan{
		ID: NewID(), Name: name, Sources: []string{}, Exclusions: []string{},
		Destinations: []Destination{d}, Schedule: Schedule{Kind: "manual"}, RestoreOnly: true,
	}
	if err = a.Store.SavePlan(p); err != nil {
		return Plan{}, err
	}
	_, _ = a.rememberVolume(d, d.Repository)
	return p, nil
}
