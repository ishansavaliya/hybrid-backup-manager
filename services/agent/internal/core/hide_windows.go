//go:build windows

package core

import (
	"path/filepath"

	"golang.org/x/sys/windows"
)

func hideResticDirs(repo string) {
	for _, name := range []string{"config", "data", "index", "keys", "locks", "snapshots"} {
		p, err := windows.UTF16PtrFromString(filepath.Join(repo, name))
		if err != nil {
			continue
		}
		attrs, err := windows.GetFileAttributes(p)
		if err != nil {
			continue
		}
		if attrs&windows.FILE_ATTRIBUTE_HIDDEN == 0 {
			_ = windows.SetFileAttributes(p, attrs|windows.FILE_ATTRIBUTE_HIDDEN)
		}
	}
}
