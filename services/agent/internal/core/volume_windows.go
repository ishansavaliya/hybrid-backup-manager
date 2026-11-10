//go:build windows

package core

import (
	"strings"

	"golang.org/x/sys/windows"
)

type platformVolumes struct{}

// Info finds the volume holding path: its mount root (e.g. E:\), its stable
// volume GUID path (unchanged when the drive letter changes) and its space.
func (platformVolumes) Info(path string) (VolumeInfo, error) {
	p, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return VolumeInfo{}, err
	}
	rootBuf := make([]uint16, windows.MAX_PATH+1)
	if err = windows.GetVolumePathName(p, &rootBuf[0], uint32(len(rootBuf))); err != nil {
		return VolumeInfo{}, err
	}
	root := windows.UTF16ToString(rootBuf)
	idBuf := make([]uint16, 64)
	if err = windows.GetVolumeNameForVolumeMountPoint(&rootBuf[0], &idBuf[0], uint32(len(idBuf))); err != nil {
		// Network shares have no volume GUID: space is still useful.
		idBuf = []uint16{0}
	}
	var free, total, totalFree uint64
	if err = windows.GetDiskFreeSpaceEx(&rootBuf[0], &free, &total, &totalFree); err != nil {
		return VolumeInfo{}, err
	}
	return VolumeInfo{ID: strings.ToLower(windows.UTF16ToString(idBuf)), Root: root, Total: total, Free: free}, nil
}

// Roots lists the drive letters currently present.
func (platformVolumes) Roots() []string {
	mask, err := windows.GetLogicalDrives()
	if err != nil {
		return nil
	}
	var out []string
	for i := 0; i < 26; i++ {
		if mask&(1<<uint(i)) != 0 {
			out = append(out, string(rune('A'+i))+`:\`)
		}
	}
	return out
}
