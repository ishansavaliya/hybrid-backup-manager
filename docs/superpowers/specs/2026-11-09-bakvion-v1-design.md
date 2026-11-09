# Bakvion v1 — Product Design

Date: 2026-11-09 · Branch: `design/v1` · Status: draft for owner approval

Bakvion — *Your Data. Always Protected.* A Windows 10/11 file-backup product sold by the owner (Ishan, "the admin") to small businesses in Gujarat. Clients download a Windows installer, sign in with credentials the admin gives them, and manage everything from the desktop app. There is no client-facing website beyond a public download page. The admin manages clients and memberships from a private web panel.

This document builds on the existing development milestone in this repository (Go/restic agent, Tauri/React desktop, Next.js web, Supabase). See `docs/PRODUCTION_READINESS.md` for what that milestone already proves.

Items marked **(builder's call)** were decided during design without the owner and may be revisited. Everything else was agreed with the owner.

---

## 1. Intent

The owner wants to sell Bakvion as a paid membership product. A client must be able to download one `.exe`, install it without help, sign in, set up backups to a local disk or Google Drive, and then forget about it: backups run on schedule, old versions clean themselves up (if the client chooses), email reports tell them what happened, and updates install themselves. The owner controls who can use it and until when, from one admin panel.

Success looks like: a non-technical shop owner installs Bakvion from a WhatsApp-shared code with zero calls to the owner, and when membership lapses, new backups stop but every past backup can still be restored.

## 2. Goals

1. **Accounts & membership** — admin-created client accounts; sign-in by username + password or a one-time 6-digit code; membership expiry with in-app countdown; hard block on expiry that still allows restore; per-client PC limit.
2. **Admin panel** at `<site>/bkpadmin` — single admin, manages clients, codes, memberships, PCs, sees backup health, audit history.
3. **New UI** — "Graphite" design in light and dark themes, in English, Hindi and Gujarati.
4. **Complete backup product** — client-chosen schedules, optional automatic cleanup, email reports, local disk and Google Drive (via Google's Drive for desktop app) destinations, consistent copies of open files.
5. **Ship-ready Windows delivery** — one installer that sets up app + background service with no technical steps, silent automatic updates, public download page.
6. **Everything versioned** — one version number across all parts, bumped on every release, visible everywhere.

## 3. Non-goals (v1)

- macOS or Linux desktop product.
- Payments, invoices or online renewal inside Bakvion (admin collects payment outside and extends the date).
- A client web dashboard. Clients use only the desktop app.
- Direct Google Drive API integration, OneDrive, Dropbox, S3, TeraBox, JioCloud.
- Application-specific integrations (e.g., Tally). Bakvion backs up folders, nothing app-aware.
- Bare-metal / system-image backup.
- Code-signing certificate (deferred; may be added later without redesign).
- Multiple admin users or admin roles.

## 4. Anti-goals (failure even if it "works")

- Any fake, sample or illustrative data shown to clients or the admin.
- Claiming a feature, destination or platform works without real tests proving it.
- SMTP credentials, database keys or any server secret inside the desktop app or installer.
- Losing the ability to restore existing backups — on expiry, block, uninstall, update or failure.
- Automatic cleanup ever deleting the last good backup.
- An update that can be faked (unsigned or unverified update files).
- A client needing to open a terminal, edit a file, or know what "restic" is.

## 5. Constraints

- **Platforms:** client PCs run Windows 10 or 11 (x64). The admin develops on an Apple Silicon Mac and has no Windows machine yet; Windows builds and automated Windows tests run on GitHub Actions `windows-latest`. Hands-on Windows acceptance happens later when the owner has a machine; nothing ships to clients before that.
- **Stack (existing, keep):** pnpm monorepo; Next.js on Vercel; Supabase Postgres; Tauri 2 + React desktop; Go agent as Windows service; restic for encrypted repositories; SQLite for local agent state.
- **Hosting budget — free tiers for the initial stage (owner decision):**
  - **Vercel Hobby (free).** Owner accepts that Hobby terms do not cover commercial use and will move to Pro as clients grow. Hobby allows only daily cron jobs, so nothing may depend on frequent server-side cron: email retries rely on the device outbox resending, and rate-limit state lives in Postgres.
  - **Supabase Free** for Postgres (chosen over Neon Free, whose monthly compute-hour cap would suspend the database mid-month under hourly device reports). Free projects pause after 7 days without activity, so a daily Vercel cron pings the database. Old backup reports and audit rows are pruned (e.g., keep 90 days) to stay well under the 500 MB limit. Supabase Storage is **not** used for releases (egress limit).
  - **One environment (owner decision):** a single Supabase project and a single Vercel deployment serve both testing and real clients. Clients can be tagged "Test" in the admin panel for filtering/deletion.
  - **No custom domain yet; Vercel project name decided later (owner decision).** The server address is the Vercel project URL (`https://<project>.vercel.app`), supplied at build time; until it exists, development uses `http://localhost:3000`. That URL keeps working after a custom domain is added later, so installed apps never break; the builder keeps the server base URL in one config constant and lets the license/update responses announce a new preferred URL later.
  - Everything is designed so moving to paid plans or a custom domain later is a configuration change, not a redesign.
- **Repository:** private GitHub repo `ishansavaliya/hybrid-backup-manager`. Each project (§16) is built on its own branch and reviewed before merge to `main`. No force pushes.
- **Project rules (from owner's CLAUDE.md):** new npm/Go/Cargo dependencies need owner approval; database schema changes need a migration plan approved first; `.env` files are only changed with owner direction; changes are incremental; lint/type errors reported.
- **No code-signing certificate** for now: clients will see Windows SmartScreen ("Windows protected your PC → More info → Run anyway"). The download page explains this with one screenshot per language.
- **Google Drive policy:** Google's Drive API terms restrict "Backup of user or app content … to Drive" without Google's written consent. Bakvion therefore never calls Google APIs; it writes to the local folder of Google's own "Google Drive for desktop" app (see §9.3).

## 6. System overview

```
 Client PC (Windows 10/11)                                 Owner's cloud
 ┌────────────────────────────────┐                        ┌──────────────────────────────┐
 │ Bakvion desktop app (Tauri)    │                        │ Next.js on Vercel            │
 │  sign-in, plans, restore, UI   │                        │  /            public site    │
 │        │ local named pipe      │                        │  /download    download page  │
 │        ▼                       │      HTTPS (device     │  /bkpadmin    admin panel    │
 │ Bakvion Service (Go, SCM)      │◄────── token) ────────►│  /api/v1/...  device API     │
 │  scheduler · restic · VSS      │                        │  SMTP sender (owner's email) │
 │  SQLite state · outbox         │                        ├──────────────────────────────┤
 │  license check · auto-update   │                        │ Supabase Postgres (clients,  │
 │        │                       │                        │  devices, memberships, logs) │
 │        ▼                       │                        │ Public GitHub repo with      │
 │ Local disk / My Drive (mirror) │                        │  release files only          │
 └────────────────────────────────┘                        └──────────────────────────────┘
          backups never pass through the cloud                ▲ GitHub Actions uploads
                                                                 signed releases
```

Backup data goes only from the client PC to the client's own disk or Drive folder. The owner's cloud only sees account, device, membership and backup-result metadata.

## 7. Accounts, sign-in and membership

### 7.1 Client accounts
- Created only by the admin in `/bkpadmin`. No self sign-up.
- Fields: business/client name, contact person, phone (WhatsApp), notes, membership expiry date, PC limit, status (active / blocked).
- Status shown to admin: **Active**, **Expiring soon** (≤ 10 days), **Expired**, **Blocked**.

### 7.2 Sign-in methods (desktop app)
1. **Username + password** — set by the admin. Passwords stored as a slow salted hash (argon2id or bcrypt; builder's call). Admin can reset; there is no client self-service "forgot password" (client contacts the admin).
2. **6-digit code** — generated by the admin, shared by the admin on WhatsApp ("Copy for WhatsApp" button produces a ready message in the client's language). Each code:
   - signs in exactly **once**, then is consumed;
   - expires **48 hours** after creation if unused **(builder's call)**;
   - belongs to one client account.

   Because a 6-digit code alone is guessable, the server enforces strict rate limits on code attempts (per IP and globally) and logs failures **(builder's call: e.g., 5 attempts per IP per 15 min; temporary global slowdown on spikes)**.
- Sign-in screen has a segmented control: "Username" | "6-digit code", plus language picker. Text: "No account? Contact your Bakvion provider."
- After sign-in the PC stays signed in (device token) until the client signs out, the admin removes the PC, or the admin blocks the client. **(builder's call)** One Bakvion account per PC; signing in with a different account replaces the previous one after confirmation.

### 7.3 Devices and PC limit
- On first sign-in the PC registers as a device (machine name, Windows version, app version, a stable device ID generated at install).
- If the client already uses their PC limit, sign-in is refused with "Your plan allows N PCs. Contact your Bakvion provider."
- Admin can remove a PC to free a slot; that PC is signed out at its next check.

### 7.4 Membership enforcement
- The **service** (not only the UI) enforces membership, because schedules run without the UI open.
- Server issues a **signed license token** (Ed25519 signature; public key embedded in app and service) containing client ID, device ID, membership expiry, status, issue time.
- Service refreshes the token every few hours and at startup **(builder's call: every 6 h)**.
- **Offline behavior (owner decision):** when the PC has no internet or the server is unreachable, the app and service keep working fully — backups, schedules, cleanup, restore — until the **membership expiry date in the last valid license token**. There is no separate offline time limit. When connectivity returns, the service syncs immediately: refreshes the license (new expiry, block status, PC removal) and sends queued backup reports/emails. Consequence accepted by the owner: a block or PC removal reaches an offline PC only when it next comes online.
- **Clock tampering (builder's call):** the service records the latest trusted time it has seen (server time from each license refresh, and its own monotonic high-water mark of local time). If the Windows clock is moved backwards below that mark, the service treats membership as expired until it can reach the server.
- **Offline updates:** updates need internet to download; offline PCs keep their current version and update when back online. A PC that is never online can be upgraded by running a newer `Bakvion-Setup.exe` delivered by the admin (USB/WhatsApp); it upgrades in place, keeping settings, plans and backups.
- **Countdown badge:** from **10 days** before expiry, a small badge in the top bar: "Membership expires in N days — please renew" (localized). Clicking shows contact info set by the admin.
- **On expiry or block:**
  - No new backups, no scheduled runs, no new or edited plans, no cleanup.
  - **Restore and browsing of existing backups keep working**, as does the recovery kit export (§9.6).
  - App shows a clear full-width notice with renewal contact info.
  - Extending the date in the admin panel unlocks the app at its next license refresh (also "Check again" button).

## 8. Admin panel (`/bkpadmin`)

### 8.1 Admin login
- Single admin. Username and password come from environment variables (`.env.local` for development, Vercel environment settings in production). **(owner decision)** The password is stored directly in the server environment as `BKP_ADMIN_PASSWORD` (not hashed); the server compares it in constant time and it never appears in client code or logs. A session secret env var signs the admin session cookie.
- After 5 wrong attempts, admin login pauses for 15 minutes.
- Admin pages and admin API routes are unreachable without a valid admin session. `/bkpadmin` is not linked from the public site.

### 8.2 Screens
- **Clients (home):** table of all clients with name, phone, status, expiry, PCs used/limit, last backup health. Filters: expiring in 10 days, expired, blocked. Search.
- **Client detail:**
  - Edit name, contact, phone, notes.
  - Set/reset username and password.
  - **Generate 6-digit code** with "Copy for WhatsApp".
  - **Membership:** set expiry date; quick extend (+1 month, +3 months, +1 year).
  - **PC limit.**
  - **PCs:** each device's name, Windows version, app version, last seen, last backup result (OK / failed with reason); remove PC.
  - **Block now / Unblock.**
- **History log:** sign-ins, code uses, failed attempts, every admin change, with timestamps.
- **Settings (builder's call, minimal):** renewal contact text shown to clients; current released version and minimum supported version (§12).
- Admin panel is English only.

## 9. Desktop app — backup features

### 9.1 First run
1. Language (preselected from Windows language, else English) and sign-in.
2. Short guided setup: create the first backup plan (§9.2) or skip.
3. Prompt to save the recovery kit (§9.6).

### 9.2 Backup plans
Created through a wizard; the **client decides every setting** (no forced defaults):
- Name.
- Folders to back up (native folder picker) and optional exclusions.
- Destination(s): local disk/folder and/or Google Drive folder (§9.3). A plan may have more than one destination; each has its own result (existing agent behavior).
- **Schedule:** hourly / daily at a chosen time / chosen weekdays at a chosen time / manual only. Times use the PC's Windows time zone.
- **Missed runs:** if the PC was off or asleep at the scheduled time, the backup runs within ~10 minutes after the next startup/login of the service.
- **Automatic cleanup:** an on/off switch. When on, the client sets how many daily, weekly and monthly versions to keep. Cleanup runs only after a successful backup of that destination and never removes the newest successful snapshot. When off, nothing is ever deleted.
- **Disk-space warning** at 90% full on the destination drive (shown in app and in email reports).
- "Back up now" for any plan.

### 9.3 Destinations
1. **Local:** external USB disk, another internal drive, or a folder. The app remembers which physical disk it is (volume identity) so a different disk at the same letter is not used by mistake; if the disk is unplugged, the app shows "Plug in disk E: to continue" and the run is recorded as skipped/failed with that reason.
2. **Google Drive (via Google Drive for desktop):** **(builder's call)** Drive for desktop must be set to **"Mirror files"** mode, which keeps a real folder on disk (e.g., `C:\Users\<user>\My Drive`). The default "Stream files" mode exposes a virtual `G:` drive that exists only inside one Windows user's session and is invisible to the background service, so it cannot be used. The app detects the mirrored folder and offers `<My Drive>\Bakvion Backups\<plan>`; the guide walks the client through switching to Mirror mode. Uploads to Google happen whenever that Windows user is signed in and Drive for desktop is running; the app says so. If not installed, a step-by-step guide (localized, with screenshots) explains installing and signing in to Google Drive for desktop. Status wording is honest: "Saved to Google Drive folder" (Bakvion cannot confirm Google's upload completed). Restore works from the same folder on this or another PC. Requires real testing of restic repositories inside a Drive-synced folder (streaming vs mirror mode, locking, partially-synced files); the builder decides the recommended Drive mode from those tests and documents it in the guide.

### 9.4 Open files
**(builder's call)** All plans use Windows Volume Shadow Copy (restic's Windows filesystem-snapshot support) so files open in other programs are copied consistently. If VSS is unavailable, the backup proceeds without it and the report says so.

### 9.5 Restore
- Browse snapshots by date, browse files/folders, restore all or selected items **to a new folder** (existing safe behavior). Original-location overwrite is not in v1.
- Works when membership is expired or blocked.
- Works on a new PC: sign in (if membership active) or use the recovery kit offline.
- **(builder's call)** The sign-in screen has a "Restore from recovery kit" link: an account-free, restore-only mode inside the app (no terminal). It can only browse and restore; it cannot create plans or run backups.
- **(builder's call)** An expired or blocked client may still sign in on a new PC in **restore-only mode**; such a sign-in does not consume a PC-limit slot.

### 9.5a Sign-out, PC removal and account switch
**(builder's call)** Backup setup belongs to the PC, not the session, so restore ability is never lost:
- **Signed out / PC removed by admin:** plans, schedules and stored repository passwords are kept; the app drops to restore-only (same as expiry) until someone signs in again. Signing back in to the same account resumes everything.
- **Different account signs in:** after confirmation, existing plans and repositories carry over to the new account (they stay on that PC).
- Nothing on the PC is wiped by any account event. Only uninstall + explicit user choice removes local settings, and even that never touches backups.

### 9.6 Repository passwords and recovery kit
- Clients never invent or type repository passwords. The service generates a strong random password per destination and stores it protected with Windows DPAPI under the service's identity. Replaces the current plaintext password-file mechanism.
- **Recovery kit:** the app asks the client once (and from Settings anytime) to save a recovery file/printout containing what is needed to restore without this PC. Wording makes clear: "Without this kit, backups cannot be restored on a new PC if this PC is lost."
- **No key escrow (owner decision):** repository passwords never leave the client's PC except inside the recovery kit the client saves. The owner's server never stores or sees them. Backups live only on the client's own disk or their own Google Drive.
- Because the kit is the only way to restore on a new PC, the first-run kit step cannot be skipped silently: the client must either save/print the kit or tick "I understand my backups cannot be restored on another PC without this kit". Settings shows a persistent reminder until a kit is saved, and the kit is regenerated/prompted again whenever a new destination is added. The kit screen advises keeping it away from the backup disk (e.g., printed, or on a phone/another drive).

### 9.7 Email reports
- Client adds one or more recipient email addresses in Settings, and chooses: **every backup / only failures / off**. "Send test email" button.
- After every scheduled (and manual) backup, the service sends the result to the owner's server; the server emails it from the **owner's** mailbox via SMTP. SMTP host/user/password/from address live only in server environment settings.
- **Mailbox (owner decision):** the owner's Gmail account via Gmail SMTP with a Google app password (requires 2-Step Verification on that Gmail). Owner will switch providers later as clients grow; the sender must be swappable by configuration only.
- **Gmail daily limit (~500 messages/day) — (builder's call):** for plans scheduled **hourly**, "every backup" means failures are emailed immediately and successes are combined into **one daily summary** per plan; daily/weekly plans email every run. The server counts emails sent per day and, near the limit, holds non-urgent success emails for the next day's summary (failures always take priority). The admin panel shows today's sent count.
- Email content (in the client's chosen language): plan name, PC name, start/end time, result (success / partial / failed), files and size, destinations' individual results, error explanation and suggested action, disk-space warning when relevant, membership-expiry reminder when within 10 days.
- Results queue in the service's local outbox when offline and are sent when back online.
- Same results feed the admin panel's per-PC "last backup" column.

### 9.8 Settings screen
Language · theme (light / dark / follow Windows) · email reports · recovery kit · account & membership (client name, expiry, sign out) · updates (current version, "check now", last update) · about.

### 9.9 Background behavior
- The Bakvion Service runs at Windows startup whether or not the app window is open. Closing the app never stops backups.
- **(builder's call)** A system-tray icon shows status and opens the app.

## 10. UI design — "Graphite"

Approved visual direction (mockups reviewed in browser on 2026-11-09):
- Narrow icon rail on the left (logo, Overview, Plans, Restore, History, Settings), top bar with page title, membership badge, language switch (EN / हि / ગુ), theme toggle.
- **Dark theme:** near-black graphite background `#121417`, panels `#181b1f`, borders `#23272e`, text `#e8e9ec`, muted `#7d838e`.
- **Light theme:** warm off-white `#f6f5f2`, white panels, borders `#e7e4de`, text `#15171a`, muted `#6c717a`.
- **Accent:** saffron orange (`#ff8a1f` dark / `#f07a0f` light). Success green, warning amber.
- Rounded panels (14 px), Manrope typeface for Latin; Noto Sans Gujarati and Noto Sans Devanagari for Gujarati/Hindi. Fonts are bundled (no internet needed).
- Overview: large protection ring (share of plans whose last run succeeded), status line ("Last backup 12 min ago", next run), "Back up now", stat tiles (protected size, versions, destination disk usage), plan list with per-destination status.
- Sign-in: centered card, segmented Username / 6-digit code, six digit boxes for the code.
- Theme: first launch follows Windows; user choice persists.
- All existing screens are redesigned; the old green theme is removed. The public website and admin panel use the same Graphite tokens.
- Accessibility: keyboard navigation, visible focus, WCAG AA contrast in both themes.
- Only real data is shown; empty states explain what to do next.

## 11. Languages

- `en.json`, `hi.json`, `gu.json` (ISO 639-1 code `gu` for Gujarati) in a shared package used by desktop app and public website; email templates use the same files. Adding a language = adding one JSON file.
- Every user-facing string in the desktop app, installer (where the installer framework allows), public site and emails is translated. Admin panel is English only.
- Language picker on sign-in screen and in Settings; first launch follows Windows display language.
- Dates and numbers formatted per language (Indian digit grouping).
- Initial Hindi/Gujarati translations are machine-assisted; the owner will have a native speaker review `gu.json` (and `hi.json`) before selling.

## 12. Versioning

- **One version number** (semantic versioning `MAJOR.MINOR.PATCH`) for the whole product: desktop app, service, installer, web, shared packages. Starts at the next version after the current `0.1.0`.
- **(builder's call)** A single source of truth (e.g., root `VERSION` file or root `package.json`) plus one command (e.g., `pnpm release:bump patch|minor|major`) that updates every place the version appears: all `package.json` files, `tauri.conf.json`, `Cargo.toml`, the Go build version (ldflags), and adds a `CHANGELOG.md` entry.
- Pushing a git tag `vX.Y.Z` on `main` triggers the release pipeline (§13.3). No release without a version bump.
- Version shown in the app (Settings → About), in the service's reports to the server, in the admin panel per PC, in email footers, and on the download page.
- Server stores **latest version** and **minimum supported version**; devices below the minimum are told to update (and auto-update handles it).
- Desktop ↔ service local protocol and device ↔ server API are versioned (`v1`); changes are backward compatible within a major version. Agent SQLite migrations and Supabase migrations are numbered and forward-only.

## 13. Delivery: installer, updates, releases

### 13.1 Installer
- One `Bakvion-Setup-<version>.exe` (Tauri NSIS bundle **(builder's call)**), per-machine install, one UAC prompt.
- Installs desktop app, Bakvion Service, restic and fonts; registers and starts the service with automatic start and restart-on-failure; creates Start menu entry; opens the app at the sign-in screen.
- Localized installer screens where supported.
- **Service identity (builder's call, needs security review):** the service runs as LocalSystem, because VSS and reading user-chosen folders anywhere require it. To keep that safe: the local named pipe accepts only local Administrators and members of a local Windows group `Bakvion Users` that the installer creates. **(builder's call)** The installer adds the Windows user who launched setup (the signed-in desktop user, not the UAC elevation account) to that group; an administrator can add more Windows users from Bakvion Settings. Silent updates never change group membership; every request that writes to the filesystem (restore targets) is checked under the caller's identity (pipe client impersonation) so a user cannot use the service to write where they could not write themselves; the existing SCM PID check on the client side stays.
- **Uninstall:** stops and removes service and app; never deletes backups, the recovery kit, or destination folders; asks whether to keep local settings.

### 13.2 Automatic updates
- The service checks the release manifest (§13.3) periodically **(builder's call: every 6 h and at startup)**.
- Downloads a new installer in the background, verifies its **Ed25519 signature** against the public key built into the service, and installs silently when no backup or restore is running. Runs as the service, so no UAC prompt for the client.
- After update the app shows a small "Updated to vX.Y.Z" note. If an update fails, the previous version keeps running and the failure is reported to the server.
- Update signing private key is held only by the owner (GitHub Actions secret); it is separate from the license-signing key.

### 13.3 Release pipeline
- GitHub Actions on `windows-latest`: install pinned toolchains, run all tests (§15), build agent + desktop + installer, sign the update manifest and installer with the update key, publish to GitHub Releases of a **separate public repository containing only release files** (e.g., `ishansavaliya/bakvion-releases`: `latest.json` manifest + versioned installers, no source code), and record the release in the database. **(builder's call)** Chosen over Supabase Storage (egress limit on the free plan) — free and no bandwidth concerns.
- The public download page's button always points to the latest installer there.
- The source repository `hybrid-backup-manager` stays private.

### 13.4 Public website
- `/` — short product page (what Bakvion is, privacy: "your backups never leave your disks/Drive"), in EN/HI/GU.
- `/download` — download button, version, Windows 10/11 requirement, SmartScreen explanation with screenshot, install steps, how to get an account (contact the provider).
- No client login on the website.

## 14. Server: data and API

### 14.1 Database (Supabase Postgres)
The existing migration (`202611070001_foundation.sql`, designed for Supabase Auth users with owner-scoped reads) does not match the admin-managed account model. A new migration replaces/extends it. **Migration plan must be approved by the owner before any schema file is edited.** Indicative tables (builder finalizes):
- `clients` (name, contact, phone, notes, expiry, pc_limit, status, renew contact override)
- `client_logins` (username, password hash)
- `login_codes` (code hash, client, created, expires, used_at)
- `devices` (client, device ID, machine name, Windows version, app version, first/last seen, removed_at)
- `device_tokens` (device, token hash, issued, revoked)
- `backup_reports` (device, plan, destination results, status, sizes, error, timings)
- `email_recipients` / notification preferences per client
- `email_log` (queued, sent, failed)
- `audit_log` (actor admin/client/device, action, details, IP, time)
- `releases` (version, notes, published, min_supported flag)

All access goes through server-side API routes using a server-only database key. Browsers and desktop apps never talk to the database directly. Row-level security stays enabled with no public grants.

### 14.2 Device API (`/api/v1`, HTTPS, JSON)
Sign-in (password / code) → device token; license refresh → signed license token; backup report submit; email preferences get/set; test email; update manifest is static in Storage. All requests authenticated with the device token (except sign-in), rate-limited, audited.

### 14.3 Environment variables (names indicative)
Server: database URL/keys, `BKP_ADMIN_USERNAME`, `BKP_ADMIN_PASSWORD_HASH`, `BKP_SESSION_SECRET`, `LICENSE_SIGNING_PRIVATE_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. CI: update-signing private key, a token allowed to publish releases to the public release-files repository. An `.env.example` documents them without values.

## 15. Testing and acceptance

- Tests written or updated before major changes in each project.
- **Mac/Linux (developer and CI):** typecheck, lint, unit tests, database migration/RLS tests, web build, desktop frontend Playwright tests (sign-in, expiry badge, blocked state, language switch, theme), Go tests with real restic (no skips counted as passes), API tests for auth/rate limits/license signing/expiry rules.
- **Windows CI (`windows-latest`):** build agent/desktop/installer; install the service silently; real backup and restore through the service; schedule catch-up; cleanup on/off; VSS on an open file; signed-update install and rejection of a tampered update; uninstall leaves backups intact; pipe access denied to a non-authorized user.
- **Manual Windows acceptance (owner, on a real Windows 10/11 PC before first client):** SmartScreen install path, real USB disk unplug/replug, Google Drive for desktop round trip and restore on a second PC, reboot/missed schedule, expiry → block → restore still works → renew → unblock, emails received, all three languages and both themes reviewed.
- `docs/PRODUCTION_READINESS.md` is kept truthful: nothing is marked done without recorded evidence.

## 16. Build order

Four projects, each on its own branch, reviewed and merged before the next:

1. **Accounts & membership** — new DB migration (after approval), device API, license signing, admin panel, desktop sign-in + membership enforcement in service, expiry badge/block.
2. **Graphite UI + languages** — design tokens, redesign of all desktop screens, public site and admin panel styling, i18n package with en/hi/gu.
3. **Backup features** — scheduler with catch-up, cleanup toggle and retention, email reports (server SMTP + outbox), Google Drive folder destination and guide, VSS, DPAPI password storage, recovery kit, volume identity, disk-space warning.
4. **Shipping** — versioning command and changelog, NSIS installer with service install/uninstall, signed auto-update, GitHub Actions release pipeline to the public release-files repository, public download page.

## 17. Owner decisions recorded at review (2026-11-09)

- **Key escrow:** no. Backups and their keys stay only on the client's device, disk and Google Drive (§9.6).
- **Email:** owner's Gmail via SMTP for now (§9.7).
- **Hosting:** Vercel Hobby + Supabase Free for the initial stage; upgrade later (§5).
- **Domain:** none for now; use the Vercel project URL (§5).

## 18. Left to the builder

Concrete libraries (subject to dependency approval), exact table/column names, API shapes, hashing algorithm, token lifetimes and rate-limit numbers within the bounds above, tray icon details, Drive-for-desktop recommended mode, component structure, file layout of the i18n package, CI workflow structure.
