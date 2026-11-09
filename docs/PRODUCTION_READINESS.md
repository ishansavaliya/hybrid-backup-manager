# Production-readiness report

**NOT PRODUCTION READY.** This is a coherent offline-engine development milestone, not completion of the eight-phase product. No Windows installer, cloud provider, deployment or production SLA is claimed.

## Implemented and checked here

- Real encrypted restic local backup and independent persistent destination execution.
- Incremental and historical snapshots, full/selected verified new-directory recovery, standalone recovery without hosted metadata.
- Safe failure reporting for wrong passwords, unavailable sources/destinations, unsafe paths/links and corrupt data.
- SQLite migration/persistence and interrupted-worker reconciliation.
- Type-checked desktop frontend and Next.js production build; real disconnected browser tests.
- Supabase SQL migration/RLS tested in embedded PostgreSQL (PGlite), not against hosted Supabase.
- Windows Go agent cross-compilation. SCM/named-pipe/Tauri sources and Windows CI are supplied, but no Windows runtime result is available.

## Release blockers and next work

| Area                   | Status      | Exact remaining work                                                                                                          |
| ---------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Windows runtime        | BLOCKED     | Execute SCM startup/stop, UI IPC, account permissions and recovery tests on Windows                                           |
| Credential isolation   | NOT STARTED | DPAPI identity-scoped secret enrollment, recovery key export/rotation, ACL validation                                         |
| Scheduling             | NOT STARTED | Durable daily/weekly schedule tables, timezone/DST policy, missed-run retry and backoff                                       |
| External disks         | PARTIAL     | Bind volume GUID/serial, detect disconnect/reconnect and reject replacement mounts                                            |
| Job controls           | PARTIAL     | Single serialized worker and shutdown interruption exist; per-job cancellation/pause/retry and durable restore queue do not   |
| Windows filesystems    | BLOCKED     | VSS, long paths, ACL fidelity, locked files, junctions and reparse-point race review                                          |
| Original-path recovery | NOT STARTED | Confirmed overwrite/rename/skip policy and protected publication semantics                                                    |
| Restore reporting      | PARTIAL     | History persists but overview does not aggregate last verified restore; crash recovery/cleanup and progress streaming pending |
| Large datasets         | PARTIAL     | Metadata output is capped at 32 MiB; streaming manifest pagination and load/performance testing needed                        |
| Hosted management      | PARTIAL     | Actual auth deployment, device enrollment, signed commands, nonce replay checks and outbox sync                               |
| Cloud storage          | NOT STARTED | Real S3 implementation/tests; Drive approval; authorized provider integrations                                                |
| Retention              | NOT STARTED | Preview, explicit policies, successful-run guards, lock-safe forget/prune tests                                               |
| Analytics / email      | PARTIAL     | Real job counts exist; storage accounting, durations/charts, verified-restore aggregation and delivery worker pending         |
| Packaging              | NOT STARTED | WiX installer/service provisioning, rollback, upgrade, clean uninstall, signing and SmartScreen expectations                  |
| Reproducibility        | PARTIAL     | JS/Go locks supplied; Rust Cargo.lock and tested Windows toolchain/package builds pending                                     |
| API compatibility      | PARTIAL     | Typed v1 contracts exist; generated schema and compatibility tests pending                                                    |
| Security review        | NOT STARTED | Privilege/reparse race assessment, dependency audit, IPC adversarial tests and signed release verification                    |

## Acceptance matrix

PASS here: initial/incremental backup, changed file, deleted file preserved historically, restore to a new folder, selected-file restore, offline fresh-engine recovery, independent destination/credential failure, SQLite durability, unconfirmed worker interruption, wrong password, corrupt pack detection, recursive backup rejection, unsafe snapshot paths, link rejection and local write/read probe.

PENDING: original-folder overwrite, real S3 timeout/interrupted upload, physical disk removal, actual Supabase outage during agent sync, service restart/reboot on Windows, abrupt restore termination, low disk space, OAuth expiry, concurrent processes across repositories, retention/prune, fresh Windows installation, unauthorized Windows user IPC, installer lifecycle and actual hosted authentication/RLS.

A simulated missing local repository is not a physical-drive or cloud timeout test. Browser disconnected-state tests are not Windows desktop end-to-end tests. A cross-build is not a service-installation test. An embedded PostgreSQL test is not a hosted Supabase acceptance test.
