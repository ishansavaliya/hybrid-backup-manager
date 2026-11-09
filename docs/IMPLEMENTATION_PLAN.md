# Bakvion implementation plan

Your Data. Always Protected.

Implement the approved architecture as independently reviewable milestones. Local file-level backup is the first acceptance gate. Bare-metal imaging is out of scope.

| Milestone | Deliverable                                                                    | Status      |
| --------- | ------------------------------------------------------------------------------ | ----------- |
| 1         | pnpm monorepo, UI, API contracts, database foundations                         | DONE        |
| 2         | real restic encrypted backup, persistent jobs, verified offline restore        | PARTIAL     |
| 3         | Windows service, authenticated IPC, durable scheduling, external identity, VSS | PARTIAL     |
| 4         | Supabase auth, dashboard, device sync and signed commands                      | PARTIAL     |
| 5         | tested S3 and compliant Google Drive integration                               | BLOCKED     |
| 6         | retention, measured analytics, verification, email                             | PARTIAL     |
| 7         | installer, upgrades, Windows CI, release security                              | PARTIAL     |
| 8         | Windows/cloud acceptance and production readiness                              | NOT STARTED |

## Architecture

- Go agent owns SQLite, restic, jobs and local operations. UI lifetime does not own service lifetime.
- Tauri React client calls an authenticated Windows named pipe through Rust. No local HTTP control endpoint.
- SQLite is authoritative offline. Supabase is a metadata-only replica with RLS, not an archive destination.
- Repository passwords stay outside SQLite and cloud metadata. Windows service secrets require identity-scoped protection.
- Snapshot IDs are restic identifiers. Each destination has its own execution and error state.
- Restore into staging; validate all paths and avoid links; verify against restic content before publication.
- Remote recovery requests never contain executable commands and require local authorization.

## Implementation order

1. Scaffold workspace and contracts; write honest status and threat documentation.
2. Implement a CLI and tested adapter with real local encrypted backup and new-directory restore.
3. Add Windows SCM and pipe bridge foundations; keep unsupported controls unavailable.
4. Add functional offline desktop screens and hosted auth/metadata foundation.
5. Run available checks and commit coherent source with exact blockers.

## Acceptance

Real integration: initial backup, changes, deletion preserved historically, wrong password, custom-directory restore with byte verification, source/repository overlap rejection, independent destinations and integrity check. Security tests include traversal and symlink rejection. Windows installation, physical external disks, cloud accounts and reboot tests remain pending until executed. Every status change requires evidence in PROGRESS.md.
