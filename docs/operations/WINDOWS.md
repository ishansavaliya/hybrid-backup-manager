# Windows: installer, service and updates

**Not yet accepted on a real Windows PC.** The code builds and the release workflow runs the Go tests on a Windows runner, but every item in the checklist below still needs a real Windows 10/11 run.

## What the installer does

`Bakvion-Setup.exe` (Tauri NSIS, per-machine, needs administrator approval once):

1. Installs `Bakvion.exe` (the app), `BakvionService.exe` and a checksum-verified `restic.exe` into `C:\Program Files\Bakvion`.
2. Runs `BakvionService.exe install`, which:
   - creates `C:\ProgramData\Bakvion` and makes it private to SYSTEM and Administrators (a folder squatted by another user is moved aside, never used);
   - registers `BakvionService` ("Bakvion Background Backup") as LocalSystem, automatic start, restart after a crash (10 s, 30 s, then 60 s);
   - starts it.
3. Before an upgrade it stops the service; afterwards it registers and starts the new one.

Uninstall runs `BakvionService.exe uninstall` (stops and removes the service). **Backups, keys, settings and history in `C:\ProgramData\Bakvion` and on backup disks are never deleted.**

Windows shows "Windows protected your PC → More info → Run anyway" on the first install because the installer is not code-signed yet. Updates install silently without that screen.

## Who can use it

The service's named pipe (`\\.\pipe\Bakvion.v1`) admits Interactive users (anyone signed in to Windows on the PC), Administrators and SYSTEM, and rejects remote clients. The app also checks that the pipe really belongs to the registered service before sending anything.

## Files on the PC

| Path                              | Contents                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------- |
| `C:\ProgramData\Bakvion\agent.db` | Plans, schedules, history, sealed keys (DPAPI), licence, report outbox, settings |
| `C:\ProgramData\Bakvion\updates\` | Downloaded, signature-checked installers                                         |
| Backup disk `…\BakvionRepository` | The encrypted restic backup                                                      |

## Automatic updates

The service checks `https://github.com/ishansavaliya/bakvion-releases/releases/latest/download/latest.json` two minutes after start and then every six hours (an hour after a failure, 15 minutes while a backup runs). It installs a newer version only if:

- the manifest's Ed25519 signature matches the key built into the app;
- the downloaded installer's size and SHA-256 match the signed manifest, re-checked while the file is held open against changes;
- no backup is queued or running.

It runs the installer silently (`/S`). The app window closes during the update; reopen it from the Start menu. Development builds never update themselves. Settings → **About & updates** shows the app, service and latest versions, the last check, and a **Check for updates** button.

## Acceptance checklist (run on Windows 10 and 11)

**Install and service**

- [ ] Fresh install; service running after install and after a reboot.
- [ ] A second Windows user on the same PC can open the app; a remote connection cannot.
- [ ] Pre-create `C:\ProgramData\Bakvion` as a normal user, then install: the folder is moved aside and a private one is used.
- [ ] Uninstall removes the service and app; `C:\ProgramData\Bakvion` and backups remain; reinstall picks them up.

**Accounts and membership**

- [ ] Sign in with username/password and with a 6-digit code; PC limit enforced.
- [ ] Offline for days: backups continue until the synced expiry; "Last synced" and the 3-day warning appear.
- [ ] Expired or blocked: restore-only; old backups restore; "Open a backup from another PC" works.

**Backups**

- [ ] Set up an external disk, back up, restore everything and a single file (Restore calendar shows the right days).
- [ ] Daily/weekly schedule runs; PC off at that time → one catch-up run.
- [ ] Tally open during backup: its files are included (VSS); History shows any fallback note.
- [ ] Unplug the disk and reconnect it with another drive letter: next backup finds it.
- [ ] Fill a test disk past 90%: banner, badge, and email note.
- [ ] Google Drive for desktop in "Mirror files": the Google Drive button finds the folder; "Stream files" shows the guide.
- [ ] Recovery kit export; restore on a second PC with only the kit.
- [ ] Delete a plan; reopen its backup with the kit.

**Email and updates**

- [ ] Test email arrives; a failed backup emails at once; hourly plan gets the daily summary.
- [ ] Release 0.2.1 while 0.2.0 is installed: the PC updates itself silently; About & updates shows 0.2.1 for app and service.
- [ ] Update while a backup runs: it waits until the backup ends.
