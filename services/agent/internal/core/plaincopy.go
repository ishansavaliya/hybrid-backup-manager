package core

import (
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

var reservedResticNames = map[string]bool{
	"config":    true,
	"data":      true,
	"index":     true,
	"keys":      true,
	"locks":     true,
	"snapshots": true,
}

func excludedByPlan(rel string, name string, patterns []string) bool {
	relSlash := filepath.ToSlash(rel)
	for _, pat := range patterns {
		pat = strings.TrimSpace(pat)
		if pat == "" {
			continue
		}
		if ok, _ := filepath.Match(pat, name); ok {
			return true
		}
		if ok, _ := filepath.Match(pat, relSlash); ok {
			return true
		}
	}
	return false
}

// syncPlainCopy mirrors each source folder directly into repo in normal
// readable format when p.Encrypted is false (DefaultEncrypted == false).
func syncPlainCopy(repo string, p Plan) error {
	hideResticDirs(repo)
	for _, src := range p.Sources {
		srcClean := filepath.Clean(src)
		folderName := filepath.Base(srcClean)
		if reservedResticNames[strings.ToLower(folderName)] {
			folderName = folderName + "_files"
		}
		destRoot := filepath.Join(repo, folderName)
		if err := copyDirFiltered(srcClean, destRoot, p.Exclusions); err != nil {
			return err
		}
	}
	return nil
}

func copyDirFiltered(srcRoot, dstRoot string, exclusions []string) error {
	if err := os.MkdirAll(dstRoot, 0o755); err != nil {
		return err
	}
	return filepath.WalkDir(srcRoot, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil // unreadable files are already reported by restic warnings
		}
		rel, err := filepath.Rel(srcRoot, path)
		if err != nil || rel == "." {
			return nil
		}
		if excludedByPlan(rel, d.Name(), exclusions) {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		target := filepath.Join(dstRoot, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		if !d.Type().IsRegular() {
			return nil
		}
		return copyFileAtomic(path, target)
	})
}

func copyFileAtomic(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return nil
	}
	defer in.Close()
	info, err := in.Stat()
	if err != nil {
		return nil
	}
	if existing, err := os.Stat(dst); err == nil && existing.Size() == info.Size() && existing.ModTime().Equal(info.ModTime()) {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(out, in)
	closeErr := out.Close()
	if copyErr != nil {
		return copyErr
	}
	if closeErr != nil {
		return closeErr
	}
	_ = os.Chtimes(dst, info.ModTime(), info.ModTime())
	return nil
}
