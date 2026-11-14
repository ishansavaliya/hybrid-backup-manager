# Threat model

A local administrator is trusted: they can replace programs and read service memory. Everything below is about other people and other programs.

| Threat                               | Protection                                                                                              | Remaining                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Stolen backup disk                   | restic encryption; keys are not on the disk                                                             | Keep the recovery kit away from the disk                      |
| Stolen or copied PC data             | Keys sealed with DPAPI (machine scope) in a SYSTEM/Administrators-only folder                           | Local administrators can still read them                      |
| Another Windows user on the PC       | Pipe open to signed-in users by owner decision; data folder private                                     | Any signed-in user can start restores (into new folders only) |
| Squatted data folder                 | Installer takes ownership; untrusted or linked folders are moved aside                                  | Windows acceptance                                            |
| Fake or tampered update              | Ed25519-signed manifest, size and SHA-256 check, file locked against changes until launch, no downgrade | Keep the signing key secret and backed up                     |
| Compromised build tooling            | Actions pinned to commit SHAs; build job has no secrets; signing in a separate job                      | Review action updates before bumping pins                     |
| Membership bypass by clock change    | Server-signed licence; clock high-water mark; restore-only on rollback                                  | Offline use until expiry is intended                          |
| Stolen device token                  | Tokens hashed in the database; admin can remove the PC; sign-out revokes                                | —                                                             |
| Report emails abused for spam        | Device token required; at most 3 addresses; 40 emails and 5 tests per PC per day; 120 requests per hour | —                                                             |
| Admin panel brute force              | Postgres-backed rate limits; session cookie signed with a server secret                                 | Rotate the admin password that was shared in chat             |
| Malicious backup contents on restore | Path checks, link and special-file rejection, staging, verification, new folder only                    | —                                                             |
| Ransomware                           | Older encrypted versions are kept; cleanup never runs after a partial backup                            | A disconnected second copy is still advised                   |

Not protected: anything an administrator of the PC does; loss of both the PC and the recovery kit (backups cannot be decrypted without a key).
