package core

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"unicode"
)

var identifier = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`)
var snapshotIdentifier = regexp.MustCompile(`^[a-f0-9]{64}$`)

// canonical resolves an existing ancestor, including links, before comparing paths.
func canonical(path string) (string, error) {
	if !filepath.IsAbs(path) {
		return "", errors.New("absolute filesystem paths required")
	}
	path = filepath.Clean(path)
	resolved, err := filepath.EvalSymlinks(path)
	if err == nil {
		return resolved, nil
	}
	if !os.IsNotExist(err) {
		return "", err
	}
	parent := filepath.Dir(path)
	if parent == path {
		return "", err
	}
	base, err := canonical(parent)
	if err != nil {
		return "", err
	}
	return filepath.Join(base, filepath.Base(path)), nil
}
func overlaps(a, b string) bool {
	if runtime.GOOS == "windows" {
		a = strings.ToLower(a)
		b = strings.ToLower(b)
	}
	rel, err := filepath.Rel(a, b)
	return err == nil && (rel == "." || rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)))
}
func ValidatePlan(p Plan, statePath string) error {
	if !identifier.MatchString(p.ID) || strings.TrimSpace(p.Name) == "" || len(p.Name) > 120 || len(p.Sources) == 0 || len(p.Destinations) == 0 || len(p.Sources) > 32 || len(p.Destinations) > 16 {
		return errors.New("invalid plan identity, sources or destinations")
	}
	sources := []string{}
	for _, s := range p.Sources {
		v, err := canonical(s)
		if err != nil {
			return err
		}
		info, err := os.Stat(v)
		if err != nil {
			return errors.New("source unavailable; backup refused")
		}
		if !info.IsDir() {
			return errors.New("select source folders, not individual files")
		}
		sources = append(sources, v)
	}
	seen := map[string]bool{}
	repos := map[string]bool{}
	for _, d := range p.Destinations {
		if !identifier.MatchString(d.ID) || seen[d.ID] || strings.TrimSpace(d.Name) == "" {
			return errors.New("invalid or duplicate destination")
		}
		seen[d.ID] = true
		repo, err := canonical(d.Repository)
		if err != nil {
			return fmt.Errorf("local repository: %w", err)
		}
		key := repo
		if runtime.GOOS == "windows" {
			key = strings.ToLower(key)
		}
		if repos[key] {
			return errors.New("duplicate repository")
		}
		repos[key] = true
		secret, err := canonical(d.PasswordFile)
		if err != nil {
			return err
		}
		for _, s := range sources {
			if overlaps(s, repo) || overlaps(repo, s) {
				return errors.New("source and repository overlap; recursive backup refused")
			}
			if overlaps(s, secret) {
				return errors.New("password file must be outside all backup sources")
			}
			if overlaps(s, filepath.Dir(statePath)) {
				return errors.New("agent state directory must be outside backup sources")
			}
		}
		if overlaps(repo, secret) {
			return errors.New("password file must be outside repository")
		}
		if err = validateSecretFile(secret); err != nil {
			return err
		}
	}
	return nil
}
func validateSecretFile(path string) error {
	fi, err := os.Lstat(path)
	if err != nil {
		return errors.New("password file unavailable")
	}
	if !fi.Mode().IsRegular() || fi.Size() < 16 || fi.Size() > 4096 {
		return errors.New("password file must be a regular file containing 16–4096 bytes")
	}
	if runtime.GOOS != "windows" && fi.Mode().Perm()&0077 != 0 {
		return errors.New("password file must have mode 0600 or stricter")
	}
	return nil
}

// Snapshot paths may be absolute inside restic. Reject ambiguous Windows names on every host.
func safeRelative(path string) (string, error) {
	if strings.ContainsAny(path, "\\:\x00<>\"|?*") || strings.ContainsFunc(path, unicode.IsControl) || strings.Contains(path, "//") {
		return "", errors.New("unsafe snapshot path")
	}
	path = strings.TrimPrefix(path, "/")
	if path == "" {
		return "", errors.New("empty snapshot path")
	}
	for _, part := range strings.Split(path, "/") {
		upper := strings.ToUpper(strings.SplitN(part, ".", 2)[0])
		reserved := upper == "CON" || upper == "PRN" || upper == "AUX" || upper == "NUL" || regexp.MustCompile(`^(COM|LPT)[1-9]$`).MatchString(upper)
		if part == "" || part == "." || part == ".." || strings.TrimRight(part, " .") != part || reserved {
			return "", errors.New("unsafe snapshot path component")
		}
	}
	return filepath.FromSlash(path), nil
}
