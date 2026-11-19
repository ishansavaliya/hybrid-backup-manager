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

type Engine struct {
	Binary string
	// FSSnapshot reads sources from a Windows shadow copy (VSS), so files
	// kept open by other programs (Tally, Outlook, databases) are backed up.
	FSSnapshot bool
}

// BackupResult is a confirmed snapshot plus anything the client should know.
type BackupResult struct {
	Snapshot string
	Warnings []string
}

// Backup warnings shown in History and in email reports.
const (
	WarnNoShadowCopy = "Backed up without a Windows snapshot; files open in other programs may be skipped"
	WarnShadowFailed = "Windows snapshot unavailable for a drive; open files were read directly"
	WarnUnreadable   = "Some files could not be read and were skipped"
)

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
func friendlyResticError(err error, diag string, backup bool) error {
	d := strings.ToLower(diag)
	var exit *exec.ExitError
	code := -1
	if errors.As(err, &exit) {
		code = exit.ExitCode()
	}
	switch {
	case code == 10 || strings.Contains(d, "does not exist") || strings.Contains(d, "cannot find the path") || strings.Contains(d, "no such file") || strings.Contains(d, "is not a repository"):
		return errors.New("External backup disk or folder is not connected. Plug in your backup drive and try again.")
	case code == 11 || strings.Contains(d, "lock"):
		return errors.New("Another backup or check is currently using this disk. Please wait a moment and try again.")
	case code == 12 || strings.Contains(d, "wrong password") || strings.Contains(d, "no key found"):
		return errors.New("The backup key does not match this backup folder. Check your recovery kit key and try again.")
	case strings.Contains(d, "no space") || strings.Contains(d, "not enough space") || strings.Contains(d, "disk full"):
		return errors.New("Your backup disk is full. Free up space on the disk or connect a larger drive and try again.")
	case backup:
		return errors.New("Backup could not complete. Make sure your backup disk is connected and accessible, then try again.")
	default:
		return errors.New("Could not access the backup folder. Make sure your backup disk is connected and try again.")
	}
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
		return nil, friendlyResticError(err, diagnostic.String(), false)
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
	if err == nil && !DefaultEncrypted {
		hideResticDirs(repo)
	}
	return err
}
func (e Engine) Backup(ctx context.Context, d Destination, p Plan) (string, error) {
	r, err := e.BackupDetailed(ctx, d, p)
	return r.Snapshot, err
}

// BackupDetailed runs one backup. With FSSnapshot, a run that fails because
// the shadow copy cannot be used is retried once without it. Restic exit code
// 3 (snapshot made, some files unreadable) counts as success with a warning.
func (e Engine) BackupDetailed(ctx context.Context, d Destination, p Plan) (BackupResult, error) {
	r, diag, err := e.backupOnce(ctx, d, p, e.FSSnapshot)
	if err != nil && e.FSSnapshot && ctx.Err() == nil && shadowProblem(diag) {
		r, _, err = e.backupOnce(ctx, d, p, false)
		if err == nil {
			r.Warnings = append([]string{WarnNoShadowCopy}, r.Warnings...)
		}
	}
	if err == nil && !p.Encrypted {
		_ = syncPlainCopy(d.Repository, p)
	}
	return r, err
}

func shadowProblem(diag string) bool {
	d := strings.ToLower(diag)
	return strings.Contains(d, "vss") || strings.Contains(d, "fs-snapshot") || strings.Contains(d, "shadow")
}

func (e Engine) backupOnce(ctx context.Context, d Destination, p Plan, shadow bool) (BackupResult, string, error) {
	args := []string{"backup", "--tag", "bakvion-plan:" + p.ID}
	if shadow {
		args = append(args, "--use-fs-snapshot")
	}
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
			return BackupResult{}, "", errors.New("sources on different volumes require separate plans in this milestone")
		}
		relative = append(relative, rel)
	}
	args = append(args, relative...)
	cmd, err := e.command(ctx, d, args...)
	if err != nil {
		return BackupResult{}, "", err
	}
	cmd.Dir = base
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return BackupResult{}, "", err
	}
	var diagnostic boundedBuffer
	cmd.Stderr = &diagnostic
	if err = cmd.Start(); err != nil {
		return BackupResult{}, "", err
	}
	var snapshot string
	var events boundedBuffer
	scan := bufio.NewScanner(stdout)
	scan.Buffer(make([]byte, 65536), 4*1024*1024)
	for scan.Scan() {
		var event struct {
			Type     string `json:"message_type"`
			Snapshot string `json:"snapshot_id"`
		}
		if json.Unmarshal(scan.Bytes(), &event) == nil {
			switch event.Type {
			case "summary":
				snapshot = event.Snapshot
			case "error", "exit_error":
				_, _ = events.Write(append(scan.Bytes(), '\n'))
			}
		}
	}
	scanErr := scan.Err()
	if scanErr != nil {
		_ = cmd.Process.Kill()
	}
	err = cmd.Wait()
	diag := diagnostic.String() + events.String()
	if scanErr != nil {
		return BackupResult{}, diag, scanErr
	}
	result := BackupResult{Snapshot: snapshot}
	if strings.Contains(strings.ToLower(diag), "failed to create snapshot") {
		result.Warnings = append(result.Warnings, WarnShadowFailed)
	}
	var exit *exec.ExitError
	if errors.As(err, &exit) && exit.ExitCode() == 3 && snapshotIdentifier.MatchString(snapshot) {
		result.Warnings = append(result.Warnings, WarnUnreadable)
		return result, diag, nil
	}
	if err != nil {
		return BackupResult{}, diag, friendlyResticError(err, diag, true)
	}
	if !snapshotIdentifier.MatchString(snapshot) {
		return BackupResult{}, diag, errors.New("restic did not confirm snapshot completion")
	}
	return result, diag, nil
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
