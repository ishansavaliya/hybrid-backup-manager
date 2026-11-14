//go:build windows

package update

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"os/exec"
	"syscall"

	"golang.org/x/sys/windows"
)

// launch re-checks the installer's hash while holding it open with sharing
// limited to reading, so nobody can change it between the check and the
// start; Windows can still open it to run it.
func launch(installer, sha string) error {
	p, err := windows.UTF16PtrFromString(installer)
	if err != nil {
		return err
	}
	h, err := windows.CreateFile(p, windows.GENERIC_READ, windows.FILE_SHARE_READ, nil, windows.OPEN_EXISTING, windows.FILE_ATTRIBUTE_NORMAL, 0)
	if err != nil {
		return err
	}
	f := os.NewFile(uintptr(h), installer)
	defer f.Close()
	sum := sha256.New()
	if _, err = io.Copy(sum, f); err != nil {
		return err
	}
	if hex.EncodeToString(sum.Sum(nil)) != sha {
		return errors.New("update: installer changed after it was verified")
	}
	cmd := exec.Command(installer, "/S")
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: windows.DETACHED_PROCESS | windows.CREATE_NEW_PROCESS_GROUP,
		HideWindow:    true,
	}
	if err = cmd.Start(); err != nil {
		return err
	}
	return cmd.Process.Release()
}
