package core

import (
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
)

// Google Drive for desktop in "Mirror files" mode keeps a real folder
// (C:\Users\<name>\My Drive) that the background service can write to; Drive
// then uploads it. "Stream files" mode is a per-user virtual drive (G:\My
// Drive) that a Windows service cannot use.

// DriveFolder is a Google Drive folder found on this PC.
type DriveFolder struct {
	Path string `json:"path"`
	Mode string `json:"mode"` // "mirror" or "stream"
}

// Search locations; variables so tests can point them at temp folders.
var (
	driveUsersRoots = func() []string {
		if runtime.GOOS == "windows" {
			drive := os.Getenv("SystemDrive")
			if drive == "" {
				drive = "C:"
			}
			return []string{drive + `\Users`}
		}
		if home, err := os.UserHomeDir(); err == nil {
			return []string{filepath.Dir(home)}
		}
		return nil
	}
	driveLetters = func() []string { return volumes.Roots() }
)

var skipProfiles = map[string]bool{"public": true, "default": true, "default user": true, "all users": true}

func isDir(p string) bool {
	info, err := os.Stat(p)
	return err == nil && info.IsDir()
}

// FindGoogleDrive lists mirror folders first, then streamed drives.
func FindGoogleDrive() []DriveFolder {
	out := []DriveFolder{}
	seen := map[string]bool{}
	add := func(path, mode string) {
		if k := strings.ToLower(path); !seen[k] {
			seen[k] = true
			out = append(out, DriveFolder{Path: path, Mode: mode})
		}
	}
	for _, root := range driveUsersRoots() {
		entries, err := os.ReadDir(root)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if !e.IsDir() || skipProfiles[strings.ToLower(e.Name())] {
				continue
			}
			profile := filepath.Join(root, e.Name())
			for _, c := range []string{
				filepath.Join(profile, "My Drive"),
				filepath.Join(profile, "Google Drive", "My Drive"),
				filepath.Join(profile, "Google Drive"),
			} {
				if isDir(c) {
					add(c, "mirror")
					break
				}
			}
		}
	}
	for _, letter := range driveLetters() {
		if c := filepath.Join(letter, "My Drive"); isDir(c) {
			add(c, "stream")
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Mode == "mirror" && out[j].Mode != "mirror" })
	return out
}
