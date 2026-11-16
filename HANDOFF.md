# Bakvion: handoff

Updated: 14 November 2026. Branch: `feat/accounts-membership` (pushed to `ishansavaliya/hybrid-backup-manager`; to be merged into `main`).

## State

All planned code is written and tested on macOS (real restic backups, unit, database and browser tests). **Nothing has been run on a real Windows PC yet.** The Windows-only parts compile and are exercised by the release workflow's Windows test job, but install, service, VSS, drive-letter, DPAPI and auto-update behaviour must be accepted on Windows 10/11 using the checklist in [docs/operations/WINDOWS.md](docs/operations/WINDOWS.md).

## Owner decisions that shape the code

- One environment only: Supabase Free + Vercel Hobby, no custom domain yet.
- Admin panel at `/bkpadmin`, one admin; username and password stored directly in server env.
- Clients sign in with username/password or a one-time 6-digit code; membership and PC limit are managed by the admin.
- Offline use until the last-synced expiry; restore-only after expiry; restoring old backups is always allowed.
- Backups go only to the client's own disk or their Google Drive (Drive for desktop, "Mirror files"). No key escrow: keys stay on the PC and in the client's recovery kit.
- Anyone signed in to Windows on the PC may use the app (pipe access: Interactive users, Administrators, SYSTEM).
- Code signing is skipped for now: Windows shows "Windows protected your PC" on first install only; updates are silent.
- Gmail SMTP for emails (about 500 per day); move to a transactional provider as clients grow.
- Direct Google Drive upload (no Drive app) is not built: Google's Drive API terms forbid backing up an app's content to Drive without Google's express prior written consent. Drive for desktop ("Mirror files") is the supported route.

## Where things are

| Area                                                         | Code                                                                                                                        |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Accounts, licence, offline expiry                            | `services/agent/internal/core/account.go`, `internal/license`, `apps/web/lib/server/device-api.ts`                          |
| Plans, schedules, cleanup                                    | `internal/core/agent.go`, `schedule.go`, `restic.go`                                                                        |
| Managed keys, recovery kit, open/delete plans                | `internal/core/keys.go`, `recover.go`, `plans.go`, `sealer_*.go`                                                            |
| VSS fallback, drive letters, disk space, Google Drive folder | `internal/core/restic.go`, `volume*.go`, `gdrive.go`                                                                        |
| Email reports                                                | `internal/core/reports.go`, `apps/web/lib/server/reports.ts`, `app/api/v1/device/reports`                                   |
| Updates, service install                                     | `internal/update`, `internal/core/updates.go`, `cmd/bakvion/install_windows.go`, `apps/desktop/src-tauri/windows/hooks.nsh` |
| Desktop screens                                              | `apps/desktop/src/screens/*`                                                                                                |
| Website, admin                                               | `apps/web/app/(site)`, `apps/web/app/bkpadmin`                                                                              |
| Release                                                      | `scripts/release.mjs`, `scripts/sign-update.mjs`, `.github/workflows/release.yml`                                           |

## Owner setup still to do

1. Add a README to the public `ishansavaliya/bakvion-releases` repository (publishing fails on an empty repository).
2. Merge `feat/accounts-membership` into `main` so Vercel deploys it (the Supabase migrations are already applied).
3. In the private repository's Actions settings: secrets `RELEASES_TOKEN` and `BAKVION_UPDATE_SIGNING_KEY` (content of `~/.bakvion/update-signing-key.txt`; keep a backup of that file), variable `BAKVION_SERVER_URL`.
4. `pnpm release 0.2.0`, then the printed git commands.
5. Rotate the Gmail app password and admin password that were shared in chat.
6. Windows acceptance testing.

## Rules for continuing

Follow the repository and user instructions (CLAUDE.md): list files before editing, no new dependencies or schema changes without approval, run all checks, never claim Windows results without running them, scan for secrets before every push, and do not run database commands.
