package core

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type Engine struct{ Binary string }

// No shell is used. Provider and password environment injection is deliberately removed.
// A managed key (d.password) is handed to restic only through this child's
// environment; a password file must pass the private-file checks.
func (e Engine) command(ctx context.Context, d Destination, args ...string) (*exec.Cmd, error) {
	base := []string{"--repo", d.Repository, "--json", "--no-cache"}
	switch {
	case d.PasswordFile != "":
		if err := validateSecretFile(d.PasswordFile); err != nil {
			return nil, err
		}
		base = append(base, "--password-file", d.PasswordFile)
	case d.password == "":
		return nil, errors.New("destination key unavailable")
	}
	cmd := exec.CommandContext(ctx, e.Binary, append(base, args...)...)
	for _, v := range os.Environ() {
		key := strings.SplitN(v, "=", 2)[0]
		if !strings.HasPrefix(key, "RESTIC_") && !strings.HasPrefix(key, "RCLONE_") {
			cmd.Env = append(cmd.Env, v)
		}
	}
	if d.PasswordFile == "" {
		cmd.Env = append(cmd.Env, "RESTIC_PASSWORD="+d.password)
	}
	return cmd, nil
}

// Forget applies the plan's retention to its own snapshots and prunes data
// no longer referenced. The newest snapshot is always kept.
func (e Engine) Forget(ctx context.Context, d Destination, planID string, r Retention) error {
	if !r.Enabled {
		return nil
	}
	if err := ValidateRetention(r); err != nil {
		return err
	}
	args := []string{"forget", "--tag", "bakvion-plan:" + planID, "--keep-last", "1", "--prune"}
	if r.Daily > 0 {
		args = append(args, "--keep-daily", fmt.Sprint(r.Daily))
	}
	if r.Weekly > 0 {
		args = append(args, "--keep-weekly", fmt.Sprint(r.Weekly))
	}
	if r.Monthly > 0 {
		args = append(args, "--keep-monthly", fmt.Sprint(r.Monthly))
	}
	_, err := e.run(ctx, d, args...)
	return err
}

type boundedBuffer struct{ bytes.Buffer }

func (b *boundedBuffer) Write(p []byte) (int, error) {
	n := len(p)
	if b.Len() < 16384 {
		left := 16384 - b.Len()
		if len(p) > left {
			p = p[:left]
		}
		_, _ = b.Buffer.Write(p)
	}
	return n, nil
}

type limitedOutput struct{ bytes.Buffer }

func (b *limitedOutput) Write(p []byte) (int, error) {
	if b.Len()+len(p) > 32*1024*1024 {
		return 0, errors.New("restic metadata output exceeds 32 MiB milestone limit")
	}
	return b.Buffer.Write(p)
}
func (e Engine) run(ctx context.Context, d Destination, args ...string) ([]byte, error) {
	cmd, err := e.command(ctx, d, args...)
	if err != nil {
		return nil, err
	}
	var out limitedOutput
	var diagnostic boundedBuffer
	cmd.Stdout = &out
	cmd.Stderr = &diagnostic
	if err = cmd.Run(); err != nil {
		return nil, fmt.Errorf("restic operation failed (%v); check repository availability, credentials, access and integrity", err)
	}
	return out.Bytes(), nil
}
func (e Engine) Init(ctx context.Context, d Destination) error {
	repo, err := canonical(d.Repository)
	if err != nil {
		return err
	}
	// Init is never automatic during backup, especially when an external drive is absent.
	if _, err = os.Stat(repo); os.IsNotExist(err) {
		if _, err = os.Stat(filepath.Dir(repo)); err != nil {
			return errors.New("repository parent unavailable")
		}
		if err = os.Mkdir(repo, 0700); err != nil {
			return err
		}
	} else if err != nil {
		return err
	}
	_, err = e.run(ctx, d, "init", "--repository-version", "2")
	return err
}
func (e Engine) Backup(ctx context.Context, d Destination, p Plan) (string, error) {
	args := []string{"backup", "--tag", "bakvion-plan:" + p.ID}
	for _, x := range p.Exclusions {
		args = append(args, "--exclude", x)
	}
	args = append(args, "--")
	// Use relative paths below a common parent: avoid archiving unrelated
	// ancestor ownership/ACL metadata (for example /tmp or a drive root).
	base := filepath.Dir(p.Sources[0])
	for _, source := range p.Sources[1:] {
		for !overlaps(base, source) && filepath.Dir(base) != base {
			base = filepath.Dir(base)
		}
	}
	relative := make([]string, 0, len(p.Sources))
	for _, source := range p.Sources {
		rel, err := filepath.Rel(base, source)
		if err != nil {
			return "", errors.New("sources on different volumes require separate plans in this milestone")
		}
		relative = append(relative, rel)
	}
	args = append(args, relative...)
	cmd, err := e.command(ctx, d, args...)
	if err != nil {
		return "", err
	}
	cmd.Dir = base
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", err
	}
	var diagnostic boundedBuffer
	cmd.Stderr = &diagnostic
	if err = cmd.Start(); err != nil {
		return "", err
	}
	var snapshot string
	scan := bufio.NewScanner(stdout)
	scan.Buffer(make([]byte, 65536), 4*1024*1024)
	for scan.Scan() {
		var event struct {
			Type     string `json:"message_type"`
			Snapshot string `json:"snapshot_id"`
		}
		if json.Unmarshal(scan.Bytes(), &event) == nil && event.Type == "summary" {
			snapshot = event.Snapshot
		}
	}
	scanErr := scan.Err()
	if scanErr != nil {
		_ = cmd.Process.Kill()
	}
	err = cmd.Wait()
	if scanErr != nil {
		return "", scanErr
	}
	if err != nil {
		return "", fmt.Errorf("backup failed (%v); no retention performed", err)
	}
	if !snapshotIdentifier.MatchString(snapshot) {
		return "", errors.New("restic did not confirm snapshot completion")
	}
	return snapshot, nil
}
func (e Engine) Snapshots(ctx context.Context, d Destination) ([]Snapshot, error) {
	b, err := e.run(ctx, d, "snapshots")
	if err != nil {
		return nil, err
	}
	out := []Snapshot{}
	err = json.Unmarshal(b, &out)
	return out, err
}
func (e Engine) Nodes(ctx context.Context, d Destination, snapshot string) ([]Node, error) {
	if !snapshotIdentifier.MatchString(snapshot) {
		return nil, errors.New("full snapshot ID required")
	}
	b, err := e.run(ctx, d, "ls", snapshot)
	if err != nil {
		return nil, err
	}
	nodes := []Node{}
	dec := json.NewDecoder(bytes.NewReader(b))
	for dec.More() {
		var n Node
		if err = dec.Decode(&n); err != nil {
			return nil, err
		}
		if n.Type != "" {
			nodes = append(nodes, n)
		}
	}
	return nodes, nil
}
func (e Engine) Check(ctx context.Context, d Destination) error {
	_, err := e.run(ctx, d, "check", "--read-data")
	return err
}

// Restore only publishes a new tree, never overwrites existing files. Restic verifies its
// authenticated objects, --verify checks output, and dump comparison checks each file.
func (e Engine) Restore(ctx context.Context, d Destination, snapshot, target, selection string) (int, error) {
	if !snapshotIdentifier.MatchString(snapshot) {
		return 0, errors.New("full snapshot ID required")
	}
	if !filepath.IsAbs(target) {
		return 0, errors.New("absolute restore target required")
	}
	target = filepath.Clean(target)
	if _, err := os.Lstat(target); !os.IsNotExist(err) {
		return 0, errors.New("restore target must not exist; choose a new folder")
	}
	parent := filepath.Dir(target)
	resolved, err := filepath.EvalSymlinks(parent)
	if err != nil {
		return 0, errors.New("restore parent unavailable")
	}
	if !samePath(resolved, parent) {
		return 0, errors.New("restore parent must not contain links")
	}
	repo, err := canonical(d.Repository)
	if err != nil {
		return 0, err
	}
	if overlaps(repo, target) || overlaps(target, repo) {
		return 0, errors.New("restore target overlaps repository")
	}
	nodes, err := e.Nodes(ctx, d, snapshot)
	if err != nil {
		return 0, err
	}
	selected := []Node{}
	if selection != "" {
		if _, err = safeRelative(selection); err != nil {
			return 0, err
		}
		if !strings.HasPrefix(selection, "/") {
			return 0, errors.New("selection must be an absolute snapshot path")
		}
	}
	for _, n := range nodes {
		if selection != "" && n.Path != selection && !strings.HasPrefix(n.Path, strings.TrimSuffix(selection, "/")+"/") {
			continue
		}
		if n.Path == "/" && n.Type == "dir" {
			continue
		}
		if _, err = safeRelative(n.Path); err != nil {
			return 0, err
		}
		if n.Type != "file" && n.Type != "dir" {
			return 0, errors.New("restore contains links or special files; unsupported safely in this milestone")
		}
		selected = append(selected, n)
	}
	if len(selected) == 0 {
		return 0, errors.New("snapshot selection is empty")
	}
	// Same-parent staging preserves rename atomicity and cannot cross volumes.
	stage, err := os.MkdirTemp(parent, ".bakvion-restore-")
	if err != nil {
		return 0, err
	}
	defer os.RemoveAll(stage)
	args := []string{"restore", snapshot, "--target", stage, "--verify"}
	if selection != "" { // exact include patterns must not interpret user wildcards
		if strings.ContainsAny(selection, "*?[]") {
			return 0, errors.New("wildcards in recovery selection are unsupported")
		}
		args = append(args, "--include", selection)
	}
	if _, err = e.run(ctx, d, args...); err != nil {
		return 0, err
	}
	count := 0
	for _, n := range selected {
		if n.Type != "file" {
			continue
		}
		rel, _ := safeRelative(n.Path)
		f, err := os.Open(filepath.Join(stage, rel))
		if err != nil {
			return 0, err
		}
		actual := sha256.New()
		_, err = io.Copy(actual, f)
		closeErr := f.Close()
		if err != nil {
			return 0, err
		}
		if closeErr != nil {
			return 0, closeErr
		}
		cmd, err := e.command(ctx, d, "dump", snapshot, n.Path)
		if err != nil {
			return 0, err
		}
		expected := sha256.New()
		cmd.Stdout = expected
		var diagnostic boundedBuffer
		cmd.Stderr = &diagnostic
		if err = cmd.Run(); err != nil {
			return 0, errors.New("verification read failed")
		}
		if hex.EncodeToString(actual.Sum(nil)) != hex.EncodeToString(expected.Sum(nil)) {
			return 0, errors.New("restored file verification mismatch")
		}
		count++
	}
	// Check the output itself too: reject unexpected links/special files before publishing.
	if err = filepath.WalkDir(stage, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return errors.New("restore produced a link")
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if !info.IsDir() && !info.Mode().IsRegular() {
			return errors.New("restore produced a special file")
		}
		return nil
	}); err != nil {
		return 0, err
	}
	if _, err = os.Lstat(target); !os.IsNotExist(err) {
		return 0, errors.New("restore target appeared during operation")
	}
	if err = os.Rename(stage, target); err != nil {
		return 0, err
	}
	return count, nil
}
func samePath(a, b string) bool {
	if filepath.Separator == '\\' {
		return strings.EqualFold(filepath.Clean(a), filepath.Clean(b))
	}
	return filepath.Clean(a) == filepath.Clean(b)
}
