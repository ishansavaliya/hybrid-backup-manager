# Threat model — development milestone

## Assets and trust boundaries

Customer source data, encrypted restic archives, repository passwords, local paths, device authorization keys and management metadata are sensitive. The Windows service, desktop renderer, web browser, cloud account, repositories and physical drives are distinct trust boundaries. A compromised local administrator is outside the protection guarantee: they can replace executables and access service memory.

| Threat                        | Current protection                                                                   | Remaining work                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Ransomware                    | Historical encrypted snapshots; no automatic deletion or sync mirroring              | Offline/immutable copy, least-privilege repository credentials, retention separation |
| Lost device / stolen password | Restic encrypted contents and metadata; passwords outside SQLite/cloud               | Identity-scoped Windows credential protection, recovery enrollment, key rotation     |
| Compromised cloud account     | No agent-cloud commands enabled; RLS read ownership                                  | Device enrollment, asymmetric signing, replay/expiry checks, scoped tokens           |
| Unauthorized local caller     | Pipe owner/admin/SYSTEM DACL; remote clients rejected; SCM PID validation            | Real Windows positive/negative identity tests and IPC robustness review              |
| Privilege escalation          | No shell execution or local HTTP control port; service account provisioning explicit | Restricted service token, ACL validation, safe installer and update verification     |
| Malicious recovery tree       | Path checks, link/special-file rejection, new-directory staging and verification     | Reparse-point/TOCTOU review, Windows ACL fidelity, original-path overwrite policy    |
| Repository corruption         | Restic authenticated data checks and actual corrupt-pack tests                       | Recovery drills, immutable replicas and failure-injection campaigns                  |
| Sensitive diagnostics         | No restic stderr or secret output exposed by adapter; generic operation errors       | Structured redacted diagnostics, useful safe provider errors, log retention          |

## Credential limitations

This milestone uses private plaintext password files by explicit development convention. They are never placed in database rows; only file references are stored locally. Unix file modes are checked. Windows ACL enforcement and identity-protected secret enrollment are not implemented. Do not call this production-grade credential storage. Account sign-in tokens use Supabase browser session storage and must never grant filesystem access.

## Operations

Use a dedicated non-admin service identity with read access to chosen sources and write access only to repositories, its private state and staging destinations. Do not grant SYSTEM/admin backup execution merely to bypass locked-file problems. Administrators retain legitimate stop, uninstall and maintenance controls.

Restic encryption does not prevent deletion by an account with repository write access. Keep a physically disconnected or independently immutable copy; test restoration with its credentials. Password loss is unrecoverable without another valid restic key/password. Do not claim ransomware immunity.
