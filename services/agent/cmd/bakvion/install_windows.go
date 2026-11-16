//go:build windows

package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/mgr"
)

const serviceName = "BakvionService"

// interactiveUsers (S-1-5-4) is everyone signed in to Windows on this PC;
// they may use the app. Administrators and SYSTEM always can.
const interactiveUsers = "S-1-5-4"

// dataDir holds the database and downloaded updates; only SYSTEM and
// Administrators may read or write it (keys, tokens, installers).
func dataDir() string {
	base := os.Getenv("ProgramData")
	if base == "" {
		base = `C:\ProgramData`
	}
	return filepath.Join(base, "Bakvion")
}

// trustedOwner: SYSTEM, Administrators or TrustedInstaller.
func trustedOwner(sid *windows.SID) bool {
	for _, t := range []windows.WELL_KNOWN_SID_TYPE{windows.WinLocalSystemSid, windows.WinBuiltinAdministratorsSid} {
		if w, err := windows.CreateWellKnownSid(t); err == nil && sid.Equals(w) {
			return true
		}
	}
	return sid.String() == "S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464"
}

// secureDir creates or takes over the data folder so only SYSTEM and
// Administrators can use it. Any user may create folders in ProgramData, so a
// folder that already exists is trusted only when SYSTEM or Administrators
// own it and it is a real folder (not a link elsewhere); otherwise it is moved
// aside, never used. The owner becomes Administrators and an OWNER RIGHTS ACE
// removes the owner's implicit right to change permissions.
func secureDir(dir string) error {
	if info, err := os.Lstat(dir); err == nil {
		suspicious := !info.IsDir()
		if p, perr := windows.UTF16PtrFromString(dir); perr == nil {
			if attrs, aerr := windows.GetFileAttributes(p); aerr == nil && attrs&windows.FILE_ATTRIBUTE_REPARSE_POINT != 0 {
				suspicious = true
			}
		}
		if !suspicious {
			sd, serr := windows.GetNamedSecurityInfo(dir, windows.SE_FILE_OBJECT, windows.OWNER_SECURITY_INFORMATION)
			if serr != nil {
				return serr
			}
			owner, _, oerr := sd.Owner()
			suspicious = oerr != nil || owner == nil || !trustedOwner(owner)
		}
		if suspicious {
			aside := dir + ".untrusted-" + time.Now().UTC().Format("20060102-150405")
			if err = os.Rename(dir, aside); err != nil {
				return fmt.Errorf("an untrusted %s exists and could not be moved aside: %w", dir, err)
			}
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	sd, err := windows.SecurityDescriptorFromString("O:BAD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;RC;;;OW)")
	if err != nil {
		return err
	}
	owner, _, err := sd.Owner()
	if err != nil {
		return err
	}
	dacl, _, err := sd.DACL()
	if err != nil {
		return err
	}
	return windows.SetNamedSecurityInfo(dir, windows.SE_FILE_OBJECT,
		windows.OWNER_SECURITY_INFORMATION|windows.DACL_SECURITY_INFORMATION|windows.PROTECTED_DACL_SECURITY_INFORMATION,
		owner, nil, dacl, nil)
}

func waitFor(s *mgr.Service, want svc.State, limit time.Duration) error {
	deadline := time.Now().Add(limit)
	for {
		st, err := s.Query()
		if err != nil {
			return err
		}
		if st.State == want {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("service did not reach state %d", want)
		}
		time.Sleep(300 * time.Millisecond)
	}
}

func stopService(s *mgr.Service) error {
	st, err := s.Query()
	if err != nil || st.State == svc.Stopped {
		return err
	}
	if _, err = s.Control(svc.Stop); err != nil {
		return err
	}
	return waitFor(s, svc.Stopped, 40*time.Second)
}

// installService registers (or updates) the background service to run as
// LocalSystem from this executable's folder, then starts it. Run elevated
// (the installer does this). Existing data is kept.
func installService() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	dir := filepath.Dir(exe)
	restic := filepath.Join(dir, "restic.exe")
	if _, err = os.Stat(restic); err != nil {
		return errors.New("restic.exe is missing next to BakvionService.exe")
	}
	data := dataDir()
	if err = secureDir(data); err != nil {
		return fmt.Errorf("securing %s: %w", data, err)
	}
	args := []string{"--state", filepath.Join(data, "agent.db"), "--restic", restic, "--owner-sid", interactiveUsers, "service"}
	m, err := mgr.Connect()
	if err != nil {
		return err
	}
	defer m.Disconnect()
	cfg := mgr.Config{
		DisplayName:  "Bakvion Background Backup",
		Description:  "Runs Bakvion backups on schedule, even when the app window is closed.",
		StartType:    mgr.StartAutomatic,
		ErrorControl: mgr.ErrorNormal,
	}
	s, err := m.OpenService(serviceName)
	if err == nil {
		if err = stopService(s); err != nil {
			s.Close()
			return err
		}
		cmd := windows.EscapeArg(exe)
		for _, a := range args {
			cmd += " " + windows.EscapeArg(a)
		}
		cfg.BinaryPathName = cmd
		cfg.ServiceType = windows.SERVICE_WIN32_OWN_PROCESS
		cfg.ServiceStartName = "LocalSystem"
		err = s.UpdateConfig(cfg)
	} else {
		s, err = m.CreateService(serviceName, exe, cfg, args...)
	}
	if err != nil {
		return err
	}
	defer s.Close()
	// Restart after a crash: 10 s, 30 s, then every 60 s; counter resets daily.
	if err = s.SetRecoveryActions([]mgr.RecoveryAction{
		{Type: mgr.ServiceRestart, Delay: 10 * time.Second},
		{Type: mgr.ServiceRestart, Delay: 30 * time.Second},
		{Type: mgr.ServiceRestart, Delay: 60 * time.Second},
	}, 86400); err != nil {
		return err
	}
	if err = s.Start(); err != nil {
		return err
	}
	return waitFor(s, svc.Running, 30*time.Second)
}

// uninstallService stops and removes the service. Backups and settings stay.
func uninstallService() error {
	m, err := mgr.Connect()
	if err != nil {
		return err
	}
	defer m.Disconnect()
	s, err := m.OpenService(serviceName)
	if err != nil {
		return nil // not installed
	}
	defer s.Close()
	if err = stopService(s); err != nil {
		return err
	}
	return s.Delete()
}
