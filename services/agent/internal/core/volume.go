package core

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// External disks often come back with another drive letter (E: becomes F:).
// Each destination remembers its volume's stable ID; when the saved path is
// missing, the same volume is searched under the current drive letters.

// VolumeInfo describes the disk that holds a path.
type VolumeInfo struct {
	ID    string // stable volume ID; empty when unknown (network share, non-Windows)
	Root  string // mount root, e.g. E:\
	Total uint64
	Free  uint64
}

type volumeOps interface {
	Info(path string) (VolumeInfo, error)
	Roots() []string
}

// Replaced in tests.
var volumes volumeOps = platformVolumes{}

// diskFullPercent is when a destination counts as almost full.
const diskFullPercent = 90

// DiskUsage is the last measured space of a destination's disk.
type DiskUsage struct {
	PlanID        string `json:"planId"`
	DestinationID string `json:"destinationId"`
	UsedPercent   int    `json:"usedPercent"`
	FreeBytes     uint64 `json:"freeBytes"`
	TotalBytes    uint64 `json:"totalBytes"`
	CheckedAt     string `json:"checkedAt"`
}

func usedPercent(v VolumeInfo) int {
	if v.Total == 0 || v.Free > v.Total {
		return 0
	}
	return int((v.Total - v.Free) * 100 / v.Total)
}

func gb(b uint64) string { return fmt.Sprintf("%.1f GB", float64(b)/1e9) }

// existing returns path or its nearest existing parent (a repository folder
// may not exist yet before set-up).
func existing(path string) (string, error) {
	for p := path; ; p = filepath.Dir(p) {
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
		if filepath.Dir(p) == p {
			return "", errors.New("destination unavailable")
		}
	}
}

// rememberVolume records the destination's volume and free space. The saved
// path keys the row, so a relocated run updates the original destination.
func (a *Agent) rememberVolume(saved Destination, current string) (VolumeInfo, error) {
	probe, err := existing(current)
	if err != nil {
		return VolumeInfo{}, err
	}
	info, err := volumes.Info(probe)
	if err != nil {
		return VolumeInfo{}, err
	}
	key, err := repoKey(saved.Repository)
	if err != nil {
		return VolumeInfo{}, err
	}
	if current != saved.Repository {
		// A relocated run: keep the saved drive and path, refresh the space.
		_, err = a.Store.DB.Exec(`UPDATE destination_volumes SET total=?,free=?,checked_at=? WHERE repository=?`, int64(info.Total), int64(info.Free), stamp(), key)
		return info, err
	}
	rel, err := filepath.Rel(info.Root, current)
	if err != nil || strings.HasPrefix(rel, "..") {
		rel = ""
	}
	_, err = a.Store.DB.Exec(`INSERT INTO destination_volumes(repository,volume_id,root,rel,total,free,checked_at) VALUES(?,?,?,?,?,?,?)
ON CONFLICT(repository) DO UPDATE SET volume_id=CASE WHEN excluded.volume_id='' THEN destination_volumes.volume_id ELSE excluded.volume_id END,root=excluded.root,rel=CASE WHEN excluded.rel='' THEN destination_volumes.rel ELSE excluded.rel END,total=excluded.total,free=excluded.free,checked_at=excluded.checked_at`,
		key, info.ID, info.Root, rel, int64(info.Total), int64(info.Free), stamp())
	return info, err
}

// locate returns the destination at its current path. When the saved path is
// missing and its volume now has another drive letter, the path is rewritten
// for this run and a note says where the disk was found.
func (a *Agent) locate(d Destination) (Destination, string) {
	if _, err := os.Stat(d.Repository); err == nil {
		return d, ""
	}
	key, err := repoKey(d.Repository)
	if err != nil {
		return d, ""
	}
	var id, root, rel string
	err = a.Store.DB.QueryRow(`SELECT volume_id,root,rel FROM destination_volumes WHERE repository=?`, key).Scan(&id, &root, &rel)
	if err != nil || id == "" || rel == "" {
		return d, ""
	}
	for _, r := range volumes.Roots() {
		if strings.EqualFold(r, root) {
			continue
		}
		info, err := volumes.Info(r)
		if err != nil || info.ID != id {
			continue
		}
		candidate := filepath.Join(r, rel)
		if _, err = os.Stat(filepath.Join(candidate, "config")); err != nil {
			continue
		}
		moved := d
		moved.Repository = candidate
		return moved, fmt.Sprintf("Backup disk found at %s (was %s)", r, root)
	}
	return d, ""
}

// diskNote warns when the destination's disk is almost full.
func diskNote(v VolumeInfo) string {
	if p := usedPercent(v); v.Total > 0 && p >= diskFullPercent {
		return fmt.Sprintf("Backup disk is %d%% full (%s free)", p, gb(v.Free))
	}
	return ""
}

// DiskUsages lists the last measured space for every plan destination.
func (a *Agent) DiskUsages(plans []Plan) ([]DiskUsage, error) {
	out := []DiskUsage{}
	for _, p := range plans {
		for _, d := range p.Destinations {
			key, err := repoKey(d.Repository)
			if err != nil {
				continue
			}
			var total, free int64
			var checked string
			err = a.Store.DB.QueryRow(`SELECT total,free,checked_at FROM destination_volumes WHERE repository=?`, key).Scan(&total, &free, &checked)
			if errors.Is(err, sql.ErrNoRows) {
				continue
			}
			if err != nil {
				return nil, err
			}
			v := VolumeInfo{Total: uint64(total), Free: uint64(free)}
			out = append(out, DiskUsage{PlanID: p.ID, DestinationID: d.ID, UsedPercent: usedPercent(v), FreeBytes: v.Free, TotalBytes: v.Total, CheckedAt: checked})
		}
	}
	return out, nil
}
