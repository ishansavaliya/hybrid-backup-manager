# Bakvion

**Your Data. Always Protected.**

On a Mac, start with [RUN_ON_MAC.md](RUN_ON_MAC.md). To continue in another Codex project, read [HANDOFF.md](HANDOFF.md) and use its continuation prompt.

Windows-first, offline-capable encrypted file backup and recovery. This repository contains a **working development milestone**, not a production release. Real local restic integration tests pass on Linux; Windows runtime, installer and hosted-service acceptance are pending.

## What works

- Go CLI: local restic repository initialization, incremental encrypted backup, independent destination jobs, persistent SQLite history and interruption reconciliation.
- Repository snapshot listing, file-manifest browsing, write/read connection probes and complete data-integrity checks.
- Full or selected-path restore into a **new directory**, with restic verification and SHA-256 comparison against snapshot contents before publication.
- Offline recovery without SQLite, Supabase or the desktop UI.
- React desktop frontend with a native-selection wizard, jobs, snapshots, recovery and light/dark themes. Tauri Windows named-pipe bridge and SCM service source are supplied; Windows runtime validation is pending.
- Next.js dashboard with Supabase email sign-in and owner-scoped metadata reads. Device enrollment, sync and remote commands are not enabled.
- Supabase migration with 13 RLS-protected tables, workspace checks and Windows/Linux CI definitions.

Only local filesystem repositories have real integration evidence. Mounted filesystems use the same adapter but require separate network/disk acceptance. No cloud connector is supported yet. No demo data is used by either application.

## Prerequisites and builds

Use Node 24, pnpm 11.25.0, Go 1.25.5 and restic 0.18.1 for this milestone. Rust stable, Windows build tools and WebView2 are needed for Tauri on Windows. Lockfiles pin JavaScript and Go dependencies; Rust dependency locking remains a reproducibility blocker until the Windows/Rust build is run.

```sh
pnpm install --frozen-lockfile
python3 scripts/fetch-restic.py --output /absolute/private/tools
# Add that tools directory to PATH, or pass --restic explicitly.
go -C services/agent build -trimpath -o ../../artifacts/bakvion ./cmd/bakvion
pnpm typecheck
pnpm lint
pnpm test
pnpm test:database
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Create `artifacts/` before building the CLI. On Windows use `scripts/build-agent.ps1` and `pnpm --filter @bakvion/desktop tauri build --no-bundle`. The desktop executable is `apps/desktop/src-tauri/target/release/Bakvion.exe`. Bundling is intentionally disabled until service installation/upgrade/uninstall acceptance exists. No setup executable has been produced or validated.

The downloader verifies release SHA-256 checksums over HTTPS. Release-signing-key verification and dependency security review remain release gates. Do not substitute an untrusted executable in `--restic`.

## Run the applications

```sh
pnpm dev:desktop  # frontend at localhost:1420; browser cannot control the agent
pnpm dev:web      # dashboard at localhost:3000
```

For the real desktop runtime, run `pnpm --filter @bakvion/desktop tauri dev` on Windows with the registered service running. Browser mode explicitly reports disconnected status, does not invent results, and disables plan creation. Closing the desktop process never stops the separately running agent.

See [Windows operations](docs/operations/WINDOWS.md) for the development service registration procedure. Do not run the agent as LocalSystem for convenience.

## First real local backup using the CLI

Keep all source, repository, state and password locations separate. Use absolute paths. Make a strong password file containing at least 16 bytes; 32 random bytes or more are recommended. On Unix it must be mode `0600` or stricter. On Windows restrict the ACL to the service identity and authorized administrators. This development mechanism is **not** Windows credential isolation; DPAPI-backed enrollment is pending.

Save a private `plan.json` outside the repository checkout, adapting paths for your machine:

```json
{
  "version": 1,
  "method": "savePlan",
  "params": {
    "id": "documents",
    "name": "Documents",
    "sources": ["/home/me/Documents"],
    "exclusions": ["*.tmp"],
    "destinations": [
      {
        "id": "external",
        "name": "External disk",
        "repository": "/media/me/BackupDisk/BakvionRepository",
        "passwordFile": "/home/me/.config/bakvion-private/password"
      }
    ]
  }
}
```

```sh
artifacts/bakvion --state /private/bakvion/agent.db request < /private/plan.json
# Use that same --state on every command below.
```

The `request` command reads one JSON request from stdin and emits a versioned JSON response. Send these requests in order:

```json
{"version":1,"method":"testDestination","params":{"planId":"documents","destinationId":"external"}}
{"version":1,"method":"initRepository","params":{"planId":"documents","destinationId":"external"}}
{"version":1,"method":"startBackup","params":{"planId":"documents"}}
```

Each line is a **separate** invocation of `request`. Initialize only a new repository; existing repositories are not overwritten. `startBackup` queues work. On standalone CLI installations, drain the queue explicitly:

```sh
artifacts/bakvion --state /private/bakvion/agent.db work
```

On Windows the running service drains its own state database automatically. Avoid a second worker. Check actual destination outcomes using `{"version":1,"method":"overview"}`; a successful queue command does not mean the backup succeeded. Multiple destinations may have different outcomes. Backups never initialize a missing repository automatically, prune history or delete source files.

## Recovery

See [offline disaster recovery](docs/recovery/OFFLINE.md). Recover with a new restic/CLI installation and the repository password even when hosted services and SQLite are lost. Original-path overwrite, special files and symlink restoration are unavailable. File-level snapshots are **not bare-metal system images**.

## Tests and status

```sh
BAKVION_TEST_RESTIC=/absolute/path/to/restic go -C services/agent test -v ./...
go -C services/agent vet ./...
```

Without `BAKVION_TEST_RESTIC`, repository integration tests explicitly skip; do not report a skipped run as provider validation. In PowerShell set `$env:BAKVION_TEST_RESTIC` before invoking Go. CI downloads the pinned official release and runs tests on Linux and Windows, but these workflow runs have not been observed in this session.

See [implementation plan](docs/IMPLEMENTATION_PLAN.md), [test evidence](docs/PROGRESS.md), [production blockers](docs/PRODUCTION_READINESS.md), [threat model](docs/security/THREAT_MODEL.md), and [deployment instructions](docs/operations/DEPLOYMENT.md).
