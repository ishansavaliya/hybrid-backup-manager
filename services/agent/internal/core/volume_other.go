//go:build !windows

package core

import (
	"path/filepath"

	"golang.org/x/sys/unix"
)

// platformVolumes off Windows reports space only; disks are not relocated.
type platformVolumes struct{}

func (platformVolumes) Info(path string) (VolumeInfo, error) {
	var st unix.Statfs_t
	if err := unix.Statfs(path, &st); err != nil {
		return VolumeInfo{}, err
	}
	bs := uint64(st.Bsize)
	return VolumeInfo{Root: filepath.VolumeName(path) + string(filepath.Separator), Total: uint64(st.Blocks) * bs, Free: uint64(st.Bavail) * bs}, nil
}

func (platformVolumes) Roots() []string { return nil }
