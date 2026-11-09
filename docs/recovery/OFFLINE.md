# Offline disaster recovery

This is file recovery, not a bootable image or bare-metal recovery workflow. OS installation and application reinstallation remain separate tasks.

## Before a disaster

Keep independent copies of the restic repository password, a known-good restic binary/version and this guide. Keep passwords separate from disks containing repositories. Record the repository's physical location/volume identity independently. Run real restores periodically. A successful backup alone is not restore verification.

## Fresh machine

1. Install a supported OS. Obtain trusted restic 0.18.1 and build the Bakvion CLI, or use official restic directly. No Supabase login or SQLite database is required.
2. Mount the intact repository. If corruption is suspected, preserve the original and work on a copy before repair.
3. Place the correct password in a private file accessible only to the recovery identity. Do not type the password in command-line arguments.
4. List snapshots:

```sh
bakvion --restic /trusted/restic --repo /mounted/BakvionRepository --password-file /private/password snapshots
```

5. Use the full snapshot ID and a new absolute directory whose parent already exists:

```sh
bakvion --restic /trusted/restic --repo /mounted/BakvionRepository --password-file /private/password --snapshot FULL_64_HEX_ID --target /recovery/RecoveredFiles recover
```

6. Optionally add `--selection /snapshot/folder/or/file` before `recover`. Snapshot paths are shown by restic `ls`; they may differ from original absolute source paths.
7. Only a successful command with `verifiedFiles` confirms publication. The new directory contains the snapshot tree. Review restored documents before manually copying them into live application locations.

All flags precede the command. Windows accepts absolute paths such as `E:\BakvionRepository` and `C:\Recovery\RecoveredFiles` (quote paths with spaces). The backup's directory structure is retained below the target.

## Failure handling

Wrong password, missing repository, unsafe nodes, occupied targets and verification failure cause a nonzero exit. Staging is removed after handled failures. Abrupt process termination may leave a `.bakvion-restore-*` staging directory; treat it as incomplete, inspect before deleting it, and retry with a new target. Never label a staging tree verified.

If the safe Bakvion subset rejects needed links or platform-specific metadata, consult official restic restore documentation and perform recovery in an isolated environment with explicit permissions. No Windows ACL fidelity has been validated here. Do not automatically unlock a repository while another process may be active. No failed backup triggers pruning in this milestone.
