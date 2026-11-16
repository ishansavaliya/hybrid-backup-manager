# Bakvion

**Your Data. Always Protected.**

Automatic, encrypted file backups for Windows 10 and 11, sold as memberships to small businesses. Clients download one installer, sign in with a username/password or a 6-digit code from their provider, and back up to their own external disk or Google Drive. Backups never pass through Bakvion's servers.

File-level backups only; this is not a bare-metal system image.

## What is in this repository

| Path                            | What it is                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `apps/desktop`                  | Windows app (Tauri 2 + React 19). Talks to the background service over a local named pipe.                                  |
| `services/agent`                | Background service (Go): plans, schedules, restic backups, restore, licence, email-report outbox, auto-update.              |
| `apps/web`                      | Next.js 16 on Vercel: public website (`/`, `/hi`, `/gu`), admin panel (`/bkpadmin`), device API, enquiry and report emails. |
| `packages/*`                    | Shared UI (Graphite design), i18n (English, Hindi, Gujarati), types, validation.                                            |
| `supabase/migrations`           | Postgres schema (clients, devices, codes, audit, leads, backup reports).                                                    |
| `scripts/`                      | Release, update signing, restic download, agent build.                                                                      |
| `.github/workflows/release.yml` | Builds, signs and publishes the Windows installer when a version tag is pushed.                                             |

## Features

- **Accounts and membership:** the admin creates clients with a username/password or one-time 6-digit codes (shared on WhatsApp) and a PC limit. The app works offline until the synced expiry date. An expiry badge appears near the end of the membership; after expiry the app is **restore-only** (no new backups, every old backup restorable). "Last synced N days ago" and a warning after 3 days.
- **Backups:** encrypted restic backups to an external disk, another drive, a folder or a Google Drive "Mirror files" folder. Schedules (hourly, daily, chosen weekdays) with one catch-up run after the PC was off. Optional automatic cleanup of old versions.
- **Windows specifics:** open files (Tally, Outlook) are read from a shadow copy (VSS) with a safe fallback; an external disk is found again when its drive letter changes; a warning when a backup disk is 90% full.
- **Keys:** Bakvion creates each destination's key and locks it to the PC (DPAPI). A **recovery kit** file holds the keys for restoring on another PC; "Open a backup from another PC" uses it, also with an expired membership.
- **Email reports:** up to 3 addresses per PC; every backup / only failures / off; hourly plans get one daily summary; branded emails with plain-language causes and fixes.
- **Restore:** browse backups by date (calendar), restore everything or one file/folder into a new folder, verified against the backup.
- **Updates:** the service installs signed updates silently when no backup is running. Settings → About & updates shows the app, service and latest versions.
- **Admin panel:** clients, PCs (last seen, last backup, email reports), codes, history, leads from the "Connect with Bakvion experts" form.
- **Languages:** English, Hindi, Gujarati everywhere in the app and website; light and dark themes.

## Run it on a Mac (development)

Use Node 24 and the pinned pnpm through `npx` (no global install needed):

```sh
export PATH=/opt/homebrew/opt/node@24/bin:$PATH
npx --yes pnpm@11.25.0 install --frozen-lockfile
npx --yes pnpm@11.25.0 dev:web       # website + admin: http://localhost:3000 and /bkpadmin
npx --yes pnpm@11.25.0 dev:desktop   # app screens in a browser: http://localhost:1420
```

The website and admin need `apps/web/.env.local` (see `apps/web/.env.example`). The desktop preview shows "service not connected" because the background service runs only on Windows. Details: [RUN_ON_MAC.md](RUN_ON_MAC.md).

## Tests

```sh
npx --yes pnpm@11.25.0 typecheck
npx --yes pnpm@11.25.0 lint
npx --yes pnpm@11.25.0 format:check
npx --yes pnpm@11.25.0 test             # web and validation unit tests
npx --yes pnpm@11.25.0 test:database    # migrations and RLS in embedded Postgres
npx --yes pnpm@11.25.0 test:e2e         # desktop and website in Chromium
BAKVION_TEST_RESTIC=$(which restic) go -C services/agent test ./...   # real backups
GOOS=windows go -C services/agent vet ./...
```

Without `BAKVION_TEST_RESTIC` the real-backup tests skip; a skipped run is not evidence.

## Releasing

```sh
npx --yes pnpm@11.25.0 release 0.2.0   # sets the version everywhere, prints the next commands
```

Pushing the `v0.2.0` tag runs `.github/workflows/release.yml`, which publishes `Bakvion-Setup.exe` and a signed `latest.json` to the public `ishansavaliya/bakvion-releases` repository. Setup and secrets: [docs/operations/DEPLOYMENT.md](docs/operations/DEPLOYMENT.md).

## More

- [HANDOFF.md](HANDOFF.md): current state and how to continue.
- [docs/operations/WINDOWS.md](docs/operations/WINDOWS.md): installer, service, updates and the Windows test checklist.
- [docs/recovery/OFFLINE.md](docs/recovery/OFFLINE.md): restoring without the app or the internet.
- [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md): what is done and what still needs Windows acceptance.
