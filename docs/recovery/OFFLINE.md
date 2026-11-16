# Restoring without the app or the internet

File recovery, not a bootable system image. Reinstalling Windows and programs is a separate job.

## Before anything goes wrong

- Save the **recovery kit** (app → Settings → Recovery kit) to a pen drive or another safe place, away from the backup disk. It lists every backup's location and key. Save it again whenever the app says new keys were created.
- Restore a few files now and then. A successful backup is not proof that restore works.

## On a new PC, with the app (normal way)

1. Install Bakvion and sign in. Restore works even if the membership has expired.
2. Restore → **Open a backup from another PC** → choose the backup folder (on the external disk, or in Google Drive's "My Drive") → paste the key from the recovery kit.
3. Pick the backup by date and restore everything or single files into a new folder.

## Without the app (command line)

Needs `BakvionService.exe` (or the `bakvion` CLI built from `services/agent`) and a trusted `restic.exe`.

Put the key from the recovery kit into a private text file (only you can read it). Do not type the key in the command line.

List backups:

```powershell
BakvionService.exe --restic C:\Tools\restic.exe --repo E:\BakvionRepository --password-file C:\Private\key.txt snapshots
```

Restore one backup (full snapshot ID) into a new folder whose parent exists:

```powershell
BakvionService.exe --restic C:\Tools\restic.exe --repo E:\BakvionRepository --password-file C:\Private\key.txt --snapshot FULL_64_HEX_ID --target C:\Recovered\Files recover
```

Add `--selection /path/inside/backup` before `recover` for a single file or folder. Only a successful run that reports `verifiedFiles` means the files were checked against the backup. Flags always come before the command word.

Plain restic works too (`restic -r E:\BakvionRepository snapshots` with `RESTIC_PASSWORD_FILE` set), because Bakvion uses standard restic repositories.

## If something fails

A wrong key, a missing disk, unsafe paths or a failed check stop with an error and remove the partial folder. A crash can leave a `.bakvion-restore-*` folder; treat it as incomplete and restore again into a new folder. Never point a restore at a live program folder (for example Tally's data folder) while the program is open: restore to a new folder, check it, then copy.
