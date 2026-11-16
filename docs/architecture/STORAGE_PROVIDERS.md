# Storage provider support and policy review

Review date: 2026-11-14 (Google Drive re-checked against the current Drive API terms). A provider contract is not a supported connector. Every connector must demonstrate authorized authentication, listing, upload, download, integrity-verified restore, retry, token expiry and failure behavior before support is advertised.

| Provider                                       | Current status                    | Evidence / gate                                                                                        |
| ---------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Local folder                                   | DONE                              | Real backup, incremental, integrity, corrupt pack, wrong key and restore tests (Linux, macOS)          |
| External HDD/SSD                               | DONE (Windows acceptance pending) | Volume ID remembered; found again after a drive-letter change; 90% full warning                        |
| Mounted network filesystem                     | PARTIAL                           | Path adapter exists; SMB credentials, outages, locks and durability pending                            |
| S3-compatible                                  | NOT STARTED                       | Use documented S3 APIs/restic backend; credentials and real integration required                       |
| Google Drive (Drive for desktop, Mirror files) | DONE (Windows acceptance pending) | Backup written to the local My Drive folder; Google's own app uploads it; no Drive API used            |
| Google Drive API (direct upload)               | BLOCKED                           | Needs Google's express prior written consent for this use case (see below)                             |
| OneDrive / Dropbox                             | NOT STARTED                       | Authorized Microsoft Graph / Dropbox API integrations planned                                          |
| JioAICloud / JioCloud                          | BLOCKED                           | No supported public third-party backup API verified in this review                                     |
| TeraBox                                        | BLOCKED                           | Official integration documentation located; app approval, API coverage and real correctness unverified |

## Google Drive

The official [Drive API terms](https://developers.google.com/workspace/drive/api/terms) say the API is not allowed for certain use cases without Google's express prior written consent, including “Backup of user or app content from a developer’s app or project to Drive.” The [Workspace user-data policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy) also lists this backup-to-Drive use case among disallowed Drive scope uses. Backing up existing Drive files is a different use case and does not establish permission for Bakvion's destination design.

Bakvion therefore does **not** call the Drive API. The supported route is Google Drive for desktop in "Mirror files" mode: Bakvion writes the encrypted repository into the user's local My Drive folder and Google's own app syncs it, the same as any other file the user saves there. "Stream files" mode is a per-user virtual drive that the background service cannot use, so the app shows a guide to switch modes.

Do not enable a direct Drive API destination merely because rclone has a backend or OAuth works. Obtain explicit approval for the intended behavior, review scope verification/security assessments, and then run real round-trip tests. Using drive.file alone does not remove the use-case restriction.

## JioCloud

Official [JioAICloud help](https://www.jiocloud.com/help/jiocloud-on-desktop/why-am-i-unable-to-install-jiocloud-on-my-windows-device) describes the vendor desktop application. The review did not verify an official public developer contract covering third-party authentication and all required file operations. This is a lack of verified support, not a claim that no private partner API exists. Seek vendor documentation/authorization. Do not reverse-engineer login or reuse browser sessions.

## TeraBox

Search located first-party [integration documentation](https://www.terabox.com/integrations/docs/chinese) describing open-platform token and upload operations. The English documentation could not be fetched by the research tool. This establishes a lead for authorized integration research, not complete API coverage or backup support. Validate developer enrollment, permitted use, downloads, listing, deletion, quotas and durable restore semantics with an approved application before implementation. Do not use unofficial authentication endpoints.

## Transport and deletion

StorageProvider defines extension capabilities; it does not authorize arbitrary repository object writes/deletes. Restic owns archive layout, crypto and locking. Future provider adapters must enforce repository-scoped access and explicit destructive-operation authorization. rclone is not bundled or invoked in this milestone; review its exact backend behavior and dependency licenses before distribution.
