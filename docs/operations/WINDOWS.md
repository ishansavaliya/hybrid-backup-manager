# Windows development operations

**Pending Windows runtime validation. No production installer exists.**

The desktop and service are independently running executables. Build the agent using `scripts/build-agent.ps1`; build the desktop with the Tauri CLI on Windows. Do not use desktop closure as service shutdown. Windows Services is the authorized stop/restart interface.

## Development registration

1. Provision a dedicated non-administrator Windows account with Log on as a service. Assign only the source read permissions and repository/staging write permissions it needs.
2. Put the executable, restic and their directories under administrator-controlled ACLs. Do not run a writable binary from a privileged account.
3. Create a password file outside all sources and repositories. Restrict its ACL to the service identity and authorized administrators. This is temporary development provisioning, not the planned DPAPI system.
4. Find the interactive user's SID using `whoami /user`. In an elevated PowerShell invoke:

```powershell
$credential = Get-Credential # dedicated service identity, never paste its password in chat
./scripts/install-service-dev.ps1 -Executable 'C:\Program Files\Bakvion\BakvionService.exe' -Restic 'C:\Program Files\Bakvion\restic.exe' -StateDirectory 'C:\ProgramData\Bakvion\Agent' -OwnerSid 'S-1-5-21-REPLACE-WITH-REAL-SID' -ServiceCredential $credential
Start-Service BakvionService
Get-Service BakvionService
```

The script restricts state ACLs, registers automatic startup, configures restart actions and limits service-control writes to administrators/SYSTEM. The owner SID controls pipe access, not service administrator privileges. Provision paths/permissions before startup. `serve` is a diagnostic pipe mode, but the real desktop intentionally requires SCM service process authentication.

## Maintenance and removal

Use `Stop-Service BakvionService` for authorized maintenance. Service shutdown interrupts work; unconfirmed jobs become interrupted on next startup. Inspect snapshots before rerunning. The development uninstall script stops and removes registration while preserving state, repositories and passwords. Remove application files only after service termination and preserve offline recovery material independently.

## Required acceptance before installer release

Run on actual Windows: install, upgrade with rollback, reboot and missed schedules, failure recovery, restricted user IPC, wrong owner denial, pipe squatting, service stop during backup/restore, external drive removal/reinsertion, long paths, junctions, locked files/VSS, ACL restoration and clean uninstall. Current service startup/recovery scripts are not evidence that these tests passed.

Scheduling, volume GUID binding, VSS, tray launcher, updates, MSI/EXE packaging and signing are not implemented. CI builds unsigned executables only. Unsigned binaries are not claimed trusted by SmartScreen.
