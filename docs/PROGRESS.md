# Progress and actual validation evidence

Date: 2026-11-07. Environment: Linux x64. Repository baseline: public main at af484db6cc298762c189331583a298c74b6368e6 contained only a one-line README; no application or AGENTS.md.

## Delivered milestone

Working offline file-backup/recovery engine plus desktop and hosted-management foundations. This is not the completed eight-phase product.

| Phase                                   | Status      | Evidence / remaining work                                                                                                        |
| --------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1: monorepo, UI, schemas, interfaces    | DONE        | pnpm workspaces; typed boundaries; React/Radix/Tailwind UI; SQLite migration; Supabase schema/RLS                                |
| 2: encrypted local snapshots / recovery | PARTIAL     | Real backup/restore subset passes; original-path overwrite, special-node fidelity and large-dataset acceptance pending           |
| 3: persistent Windows service           | PARTIAL     | SCM/ACL pipe/Rust bridge source, durable queue and interruption handling; Windows execution, scheduling, volumes and VSS pending |
| 4: Supabase / dashboard                 | PARTIAL     | Auth/read-only dashboard builds; enrollment, agent sync and command validation not implemented                                   |
| 5: storage providers                    | BLOCKED     | Local filesystem tested in phase 2; S3 not started; Google approval blocked                                                      |
| 6: analytics / email / retention        | PARTIAL     | Real job counters only; measured storage, notifications and retention not implemented                                            |
| 7: installer / release                  | PARTIAL     | Build scripts, dev registration and CI definitions; real installer/upgrade/signing not implemented                               |
| 8: production acceptance                | NOT STARTED | See PRODUCTION_READINESS.md; no Windows or hosted acceptance performed                                                           |

## Commands executed and results

- `BAKVION_TEST_RESTIC=/workspace/tools/verified/restic go test -v ./...` in services/agent: **PASS, 12 tests**, no integration skips. Final full test run also passed after path-character validation changes (32.760s).
- `go vet ./...`: PASS.
- Native Linux CLI build: PASS. Windows x64 Go agent cross-build with `CGO_ENABLED=0`: PASS. This is not Windows runtime validation.
- `python3 tests/cli-smoke.py --agent artifacts/bakvion --restic /workspace/tools/verified/restic`: PASS. Real subprocess plan save, write/read probe, init, queue, backup and independent fresh-state recovery; recovered fixture bytes matched.
- `pnpm lint`: PASS (ESLint 10).
- `pnpm typecheck`: PASS across all five packages/apps with checks.
- `pnpm test`: PASS, 2 TypeScript validation tests.
- `pnpm test:database`: PASS. Actual PostgreSQL SQL execution in PGlite; all 13 public tables have RLS; another tenant's device is invisible; browser inserts rejected. This does not validate hosted Supabase.
- `pnpm build`: PASS, Next.js 16.4.5 production build and Vite 6.4.5 desktop frontend build. No hosted credentials were required or supplied.
- `pnpm test:e2e`: PASS, 2 Chromium tests: browser cannot fabricate local connectivity/results; navigation and persisted theme behavior. These are browser-state tests, not Tauri/Windows E2E.
- `python3 scripts/fetch-restic.py --output /workspace/tools/verified`: PASS, official restic 0.18.1 archive SHA-256 checked against release SHA256SUMS over HTTPS.
- Screenshot captured and inspected: artifacts/screenshots/desktop-disconnected.png, actual browser-disconnected state, no mock data.

Go suite covers initial/incremental backup, changed files, deleted files retained in older snapshots, real byte-verified restore, selection isolation, existing target rejection, wrong password, corrupt pack detection, independent destination failure, source absence, recursion rejection, private password handling, SQLite history/reopen, interrupted state, unsafe paths/links, missing destination credentials and future-schema rejection.

## Failures found and corrected

- First real restore failed while applying unrelated ancestor directory ownership in this sandbox. Backup now uses relative paths under the common parent, avoiding that metadata; full and selected recovery tests pass.
- A failed destination credential could initially prevent other destinations from executing. Execution-time validation is now scoped to each destination; a real regression test passes.
- Restic creates read-only packs. The corruption test explicitly changes permissions on its temporary pack before corrupting it; actual corruption detection then passes.
- The environment's child compiler invocation returned empty output to Next.js. The supported TypeScript compiler-API path is selected instead; type checking remains enabled and both type checks and build pass.
- Browser tests initially could not bind the sandbox's network port; rerun with scoped network permission passed.
- Local Docker socket access was denied; embedded PostgreSQL was used for migration/RLS tests. No claim of Docker or hosted Supabase validation.

## Pending external validation

No Rust compiler or Windows execution host is installed here. Tauri native compilation, generated Cargo.lock, SCM installation, restricted identity IPC, reboot, physical disks, VSS, ACL fidelity, installer/upgrade/uninstall and signed release testing remain pending. CI workflows are source definitions only; no remote workflow success is claimed. No Supabase/Vercel deployment or cloud-account backup was performed.

Provider-policy research is documented in architecture/STORAGE_PROVIDERS.md. No unofficial JioCloud or TeraBox endpoints were used. Full remaining blockers and acceptance matrix are in PRODUCTION_READINESS.md.

## Mac handoff — 9 November 2026

Added root HANDOFF.md with architecture/status, historical test evidence, GitHub publishing context and a copyable continuation prompt; RUN_ON_MAC.md with source extraction, pinned-pnpm startup, optional Supabase configuration and troubleshooting. Packaged tracked source and both guides as a fresh ZIP. This documentation-only update does not establish macOS runtime acceptance or change application behavior. Archive integrity and required-file checks were executed; no new application test claims are made.
