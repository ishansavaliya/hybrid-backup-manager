# Bakvion: project handoff and continuation prompt

Prepared: 9 November 2026. This document replaces the need to transfer the original chat into another Codex project. It summarizes verified work, limitations, and the next agent's instructions; it is not a full chat transcript.

## Product and intended outcome

**Bakvion — Your Data. Always Protected.** A Windows-first hybrid file backup, snapshot management and disaster recovery product, with a separate desktop application, persistent background service, and web management dashboard. File-level snapshots must never be represented as bare-metal system images.

The intended finished system uses pnpm workspaces; Next.js App Router/React/TypeScript; Tauri 2; a Go Windows service; SQLite for offline state; Supabase Auth/PostgreSQL for cloud metadata; Vercel for optional hosting; restic for encrypted archives; and authorized storage-provider APIs. Backups go directly to customer storage, not through Vercel or into Supabase.

The original GitHub repository is https://github.com/ishansavaliya/hybrid-backup-manager. At inspection it contained only a one-line README, commit `af484db6`. The implemented source milestone is local commit `c6526b5`. Publishing it was attempted and failed because this environment had no GitHub write authentication. Public visibility grants reading, not permission to push. Do not assume the remote repository contains this ZIP's code.

## What has actually been implemented

- A pnpm monorepo with desktop/web apps, shared UI, TypeScript contracts and Zod validation.
- A real Go/restic local filesystem adapter: explicit encrypted-repository initialization, incremental backup, snapshot listing/manifests, full data checks and destination write/read probes.
- SQLite migrations, saved plans, queued destination runs, persistent execution/restore history, one-worker locking and interrupted-run reconciliation. Each destination has independent results; failed credentials on one destination do not prevent the others from running.
- Full and selected-path recovery to a **new directory**. Restore checks snapshot identifiers and paths, rejects links/special nodes, stages output, uses restic verification and compares file hashes with snapshot data before publishing.
- A standalone recovery CLI independent of local SQLite and hosted infrastructure.
- React desktop screens for overview, plans/native-selection wizard, activity, recovery and settings, with accessible shared components and light/dark themes. The Rust bridge checks the pipe server's PID against Windows SCM. The Go pipe server restricts access with Windows ACLs and rejects remote clients.
- Windows SCM lifecycle code, development registration/removal scripts and CI definitions. Windows behavior has not been runtime-tested.
- A Next.js dashboard with Supabase email sign-in and owner-scoped metadata views. Its schema has 13 RLS-protected tables and no browser write grants.
- Build scripts, a checksum-verified restic downloader for Windows/Linux x64, threat model, offline recovery guide, deployment instructions, progress and production-readiness reports.

The populated AI concept image from the conversation was a design reference with illustrative data and planned features. It is not a screenshot or proof that those features are implemented. Production interfaces contain no fake customer data.

## What is unfinished

This is a development milestone, not a production release. Scheduling/timezone catch-up, volume identity/disconnect detection, Windows credential isolation/DPAPI, VSS and Windows metadata fidelity, per-job controls, durable restore orchestration, original-path overwrite policies, cloud connectors, agent-cloud enrollment/sync, signed remote commands, retention/pruning, notifications, detailed analytics, the service-installing MSI/EXE, upgrades, signing and production acceptance remain incomplete.

The desktop's service bridge is Windows-only. macOS can run the web dashboard and browser frontend preview; browser preview intentionally reports disconnected and cannot execute backups. Go CLI operation on macOS has not been validated. There is no finished Bakvion-Setup.exe, .dmg, or hosted deployment.

Passwords currently use private plaintext files outside sources/repositories, not production-grade Windows credential isolation. Only local filesystem repositories have real backup/restore evidence. Physical external disks and network filesystems require their own acceptance tests.

Google Drive backup-to-Drive support is blocked on express prior written Google consent for this use case. S3, OneDrive and Dropbox are not implemented. Official TeraBox integration documentation was located, but authorized API coverage and round-trip correctness remain unverified. No supported public JioCloud third-party backup API was verified. Never use reverse-engineered authentication or claim provider support without real tests.

## Recorded validation, not new Mac results

Executed on Linux x64 on 7 November 2026:

- 12 Go tests passed with a real restic 0.18.1 binary; no integration skips.
- A real CLI subprocess smoke test passed: plan -> write probe -> init -> queue -> backup -> fresh-state verified recovery.
- Go vet, native Linux CLI build and Windows x64 Go cross-build passed.
- Workspace type checks, ESLint, formatting, 2 TypeScript tests and both frontend production builds passed.
- PostgreSQL migration and RLS checks passed using PGlite: 13 tables protected, cross-tenant device read denied, browser insert denied.
- 2 Chromium tests passed for honest disconnected state, navigation and persisted themes.

These are historical results. Windows execution, Tauri native compilation/Cargo.lock, hosted Supabase/Vercel, physical storage, OAuth providers and macOS tests have not passed merely because source or CI exists. Re-run appropriate checks in the destination environment and record their actual outcomes.

## Where to look

- `RUN_ON_MAC.md`: start here on the Mac.
- `README.md`: general build instructions and real CLI workflow.
- `docs/IMPLEMENTATION_PLAN.md`: milestone plan.
- `docs/PROGRESS.md`: historical test evidence and statuses.
- `docs/PRODUCTION_READINESS.md`: exact blockers/acceptance matrix.
- `docs/architecture/ARCHITECTURE.md`: trust boundaries and interfaces.
- `docs/security/THREAT_MODEL.md`: current protections and limitations.
- `docs/operations/WINDOWS.md`: development-only Windows registration.
- `docs/recovery/OFFLINE.md`: recovery without hosted infrastructure.
- `docs/architecture/STORAGE_PROVIDERS.md`: provider evidence and policy gates.

## Copy this prompt into the new Codex Mac project

```text
Continue development of Bakvion using the extracted project folder attached to this project. Treat this source as the existing implementation; do not scaffold over it or assume the original GitHub remote already contains it.

First read HANDOFF.md, RUN_ON_MAC.md, README.md, docs/IMPLEMENTATION_PLAN.md, docs/PROGRESS.md and docs/PRODUCTION_READINESS.md. Inspect git status and any repository instructions before changes. The source milestone was c6526b5; ZIP extraction intentionally has no .git history. Preserve all source and any user changes. Create a separate local branch if this is a checkout; if needed, initialize Git only in this new Bakvion directory.

My immediate goal is to run the existing web app on this Mac and continue the Windows-first backup product. Verify Node/pnpm requirements, install locked dependencies, run relevant checks and start the web app at localhost:3000. Without Supabase configuration, show and explain the real cloud-setup state. The optional desktop browser preview runs at localhost:1420 and intentionally cannot access a Windows service. Do not fabricate connection status, backups, metrics or provider support. Do not run backups against my actual personal folders or mutate existing repositories during setup; use disposable fixtures for tests.

Make routine implementation decisions autonomously within Bakvion. Keep changes scoped to this project. Protect my other repositories, files, GitHub settings and existing configuration. Use feature branches, review diffs, preserve secrets, avoid force pushes and destructive migrations, and request only permissions genuinely needed. If GitHub publishing is requested, verify authenticated write access and publish a separate branch to ishansavaliya/hybrid-backup-manager, never an unrelated repository. Do not paste or ask me to paste access tokens into chat.

After local startup works, prioritize production blockers in logical milestones: Windows service/IPC acceptance and credential isolation; durable scheduling/external volume handling/VSS; then authenticated device enrollment/cloud sync and secure remote requests. Retain restic and offline recovery. Add only functional UI controls. Native Windows work requires a Windows runner/host. Keep unsupported features clearly unavailable. Drive backup integration requires the documented policy approval; use officially authorized provider APIs only.

Maintain the DONE/PARTIAL/NOT STARTED/BLOCKED checklist and exact test evidence. Commit coherent working milestones, explain what changed and what remains, and never claim deployment, Windows validation, installer readiness or cloud integration without executing the relevant checks. Start by inspecting and running the existing project, not merely writing another plan.
```

## Carrying this work between applications

The screenshot shows a project view on the Mac, but does not reveal account/workspace selection or chat synchronization status. The original assistant cannot inspect that Mac's app state or move the chat into a local project. Check the same account/workspace and app updates/history search if you want to troubleshoot visibility. The source ZIP plus this prompt is a complete practical handoff for continuing work without the old chat appearing.
