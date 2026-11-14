# Production readiness

Updated 14 November 2026.

**Code complete; Windows acceptance pending.** Every feature below is implemented and tested on macOS (real restic backups, unit, database and browser tests). Windows-only behaviour compiles and runs in CI's Windows test job, but has not been accepted on a real Windows 10/11 PC. Use the checklist in [operations/WINDOWS.md](operations/WINDOWS.md).

| Area                                                            | Status        | Evidence / what remains                                                                                  |
| --------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------- |
| Accounts, codes, PC limits, offline expiry, restore-only        | DONE (Mac)    | Go and server tests; admin and app e2e. Windows sign-in run pending.                                     |
| Admin panel, website, leads                                     | DONE          | Server tests, e2e; deployed by the owner on Vercel.                                                      |
| Encrypted backup and verified restore                           | DONE (Mac)    | Real restic tests: incremental, history, selected restore, corruption, wrong key.                        |
| Schedules and catch-up                                          | DONE (Mac)    | Unit tests incl. IST offset; Windows service run pending.                                                |
| Automatic cleanup                                               | DONE (Mac)    | Real restic test; never after a partial backup.                                                          |
| Managed keys (DPAPI), recovery kit, open backup from another PC | DONE (Mac)    | Real restic tests incl. expired client on a new PC; DPAPI itself needs Windows.                          |
| Open files (VSS) with fallback                                  | PARTIAL       | Fallback tested for real; VSS needs Windows.                                                             |
| Disk found after drive-letter change; 90% disk warning          | PARTIAL       | Logic tested with a fake volume layer; Windows volume IDs need Windows.                                  |
| Google Drive (Mirror files) detection and guide                 | PARTIAL       | Logic tested; real Drive for desktop needs Windows.                                                      |
| Email reports, daily summary, limits                            | DONE (server) | Server tests and rendered emails; real delivery from a Windows run pending.                              |
| Installer, service registration, uninstall                      | PARTIAL       | Builds; needs a Windows run.                                                                             |
| Silent signed auto-update                                       | PARTIAL       | Signature, hash, idle, downgrade and stuck-install tests; real update needs Windows.                     |
| Release pipeline                                                | PARTIAL       | Workflow written with pinned actions and isolated signing; first run happens on the owner's first tag.   |
| Plan deletion; Restore calendar                                 | DONE (Mac)    | Real restic and e2e tests.                                                                               |
| Code signing                                                    | NOT STARTED   | Owner's choice for now: first install shows a SmartScreen warning.                                       |
| Direct Google Drive upload (no Drive app)                       | BLOCKED       | Drive API terms require Google's express prior written consent for backing up app content to Drive.      |
| Restore over the original location                              | NOT STARTED   | Restores always go to a new folder by design.                                                            |
| Rust lock file                                                  | PENDING       | `Cargo.lock` is produced by the first Windows build (uploaded with the installer); commit it afterwards. |

## Not claimed

A Mac test is not a Windows test; CI's Windows job is evidence, not acceptance; a skipped restic test is not a pass; an embedded Postgres test is not the hosted database.
