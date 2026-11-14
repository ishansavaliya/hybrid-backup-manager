# Deployment and releases

One environment: Supabase (Free) for the database and Vercel (Hobby) for the website, admin panel and device API. Customer backups never pass through either.

## Supabase

Apply the migrations in order in the Supabase SQL editor (the owner runs these; tools in this repository never run database commands):

1. `supabase/migrations/202611100001_accounts.sql`: clients, logins, codes, devices, tokens, audit, rate limits, settings.
2. `supabase/migrations/202611100002_leads.sql`: "Connect with Bakvion experts" enquiries.
3. `supabase/migrations/202611110001_backup_reports.sql`: email-report settings per PC and backup run reports.

Every table has row-level security and grants nothing to browser roles. Only the server, using the secret key, reads or writes.

## Vercel

- Project root: `apps/web`; framework Next.js; install and build commands come from `vercel.json`.
- The daily cron (`/api/cron/keepalive`, 03:00 UTC = 08:30 IST) keeps Supabase awake, deletes old audit rows (90 days), rate-limit rows (1 day) and backup reports (90 days), and sends the daily summary for hourly plans.
- Environment variables (names only; values are secrets, never commit them):

| Name                                                             | Purpose                                                                                |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY`                            | Database (server only)                                                                 |
| `BKP_ADMIN_USERNAME`, `BKP_ADMIN_PASSWORD`, `BKP_SESSION_SECRET` | Admin panel sign-in                                                                    |
| `LICENSE_SIGNING_PRIVATE_KEY`                                    | Signs membership licences (the app holds the public key)                               |
| `CRON_SECRET`                                                    | Protects the cron endpoint                                                             |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`  | Gmail SMTP for enquiry and backup-report emails                                        |
| `LEADS_NOTIFY_EMAIL`, `PUBLIC_ADMIN_URL`                         | Where enquiries go; admin link in emails                                               |
| `RELEASES_REPO`                                                  | Optional; default `ishansavaliya/bakvion-releases` (website download link and version) |
| `NEXT_PUBLIC_DOWNLOAD_URL/VERSION/SIZE`                          | Optional fallback when the latest release cannot be read                               |

## Windows releases

Installers are published to the **public** repository `ishansavaliya/bakvion-releases` (installers and `latest.json` only, no source). The website's Download button and the apps' auto-update both read its latest release.

One-time setup in the private repository (Settings → Secrets and variables → Actions):

| Kind     | Name                         | Value                                                                                    |
| -------- | ---------------------------- | ---------------------------------------------------------------------------------------- |
| Secret   | `RELEASES_TOKEN`             | Fine-grained token with Contents: read and write on `bakvion-releases` only              |
| Secret   | `BAKVION_UPDATE_SIGNING_KEY` | Content of `~/.bakvion/update-signing-key.txt` (created by `scripts/gen-update-key.mjs`) |
| Variable | `BAKVION_SERVER_URL`         | `https://<your-project>.vercel.app`                                                      |
| Variable | `RELEASES_REPO`              | Optional, only if the releases repository has another name                               |

Keep a safe backup of `~/.bakvion/update-signing-key.txt`. If it is lost, PCs already installed can no longer receive updates. If it leaks, an attacker could sign updates: generate a new key, ship one release signed with the old key that carries the new public key, then rotate the secret.

Each release:

```sh
npx --yes pnpm@11.25.0 release 0.2.1
git commit -am "release: v0.2.1"
git tag v0.2.1
git push origin HEAD v0.2.1
```

The workflow then runs all tests, builds the installer on Windows (with no secrets), signs `latest.json` in a separate job, checks that the app's built-in key accepts it, and publishes `Bakvion-Setup-0.2.1.exe`, `Bakvion-Setup.exe` and `latest.json`. Every action is pinned to a commit SHA.

## Limits to watch

- Gmail sends about 500 emails a day; each PC is capped at 40 report emails a day. Move to a transactional email provider before that becomes tight.
- Supabase Free pauses inactive projects (the daily cron prevents it) and limits database size.
- Check Vercel Hobby's terms for commercial use as the business grows.
