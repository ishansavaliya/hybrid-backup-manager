# Bakvion implementation plan

Your Data. Always Protected. Status updated 14 November 2026.

| Milestone                          | Deliverable                                                                                                         | Status                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Foundation                         | pnpm monorepo, Go agent, restic engine, SQLite, verified restore, offline CLI                                       | DONE                              |
| Project 1: accounts and membership | Admin panel, client logins and 6-digit codes, PC limits, signed licences, offline expiry, restore-only, sync signal | DONE                              |
| Design                             | Graphite design in light and dark; English, Hindi, Gujarati                                                         | DONE                              |
| Website and leads                  | Public site with download, "Connect with Bakvion experts", enquiry emails, admin Leads                              | DONE                              |
| B1                                 | Schedules with catch-up, automatic cleanup, managed keys, recovery kit                                              | DONE                              |
| B2                                 | Email backup reports, daily summary, admin "last backup"                                                            | DONE                              |
| B3                                 | VSS open files, drive-letter changes, 90% disk warning, Google Drive mirror folder                                  | DONE (Windows acceptance pending) |
| Restore on a new PC                | Restore-only plans opened with the recovery kit, also when expired                                                  | DONE                              |
| Project C                          | Windows installer, service install, silent signed updates, versions, release pipeline, About & updates              | DONE (Windows acceptance pending) |
| Extras                             | Delete plan, Restore calendar                                                                                       | DONE                              |
| Acceptance                         | Windows 10/11 checklist in operations/WINDOWS.md                                                                    | PENDING                           |

## Later, by owner decision

- Code signing certificate (removes the first-install SmartScreen warning).
- Direct Google Drive upload only if Google grants written consent (Drive API terms); until then Drive for desktop.
- A transactional email provider when Gmail's daily limit gets close.
