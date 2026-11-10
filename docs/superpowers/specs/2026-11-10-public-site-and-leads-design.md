# Public Website + "Connect with Bakvion experts" Leads — Design

Date: 2026-11-10 · Branch: `feat/accounts-membership` (owner: single branch) · Status: draft for owner approval
Builds on: `docs/superpowers/specs/2026-11-09-bakvion-v1-design.md`

Items marked **(builder's call)** were decided without the owner and may be revisited.

## 1. Intent

A simple, professional public website that explains what Bakvion does, shows that setup takes about 2 minutes, and lets anyone download the Windows app. People who don't have an account yet can ask to be contacted — from the website or from inside the app — and the owner gets an email and a Leads list to follow up.

## 2. Goals

1. Public site at `/` — static, **light theme only**, Graphite style (same tokens/typeface as the admin panel), English / Hindi / Gujarati.
2. "Connect with Bakvion experts" enquiry form on the website **and** on the desktop app's sign-in screen.
3. Every enquiry is saved and emailed to the owner (`ishansavaliya787@gmail.com`); the sender sees "Thank you! A Bakvion expert will contact you within 24 hours."
4. Admin panel **Leads** page to track and follow up enquiries.
5. Introduce `nodemailer` as the server's email sender (also used later for backup-report emails, Project 3).

## 3. Non-goals

- Prices, plans, online payment, self sign-up, client login on the website.
- Dark theme on the public site.
- The installer itself (Project 4) — until it exists the download button shows "Coming soon".

## 4. Public website (`/`, `/hi`, `/gu`)

Approved mockup (2026-11-10) with one change: **remove** the line "Sign in with the code from your Bakvion provider".

Sections, top to bottom:
1. **Top bar:** logo + "Bakvion", links How it works / Features / FAQ / Talk to an expert, language switch EN / हि / ગુ, Download button.
2. **Hero:** "Your data. Always protected." · one-sentence description (daily automatic backups to your own external disk or Google Drive, ~2-minute setup) · buttons **Download for Windows** and **Talk to an expert** · small print "Windows 10 & 11 · version · size". App illustration on the right (illustrative content, clearly an illustration — no real customer data).
3. **Ready in about 2 minutes:** 1 Download & install (30 sec) · 2 Sign in or connect with an expert (15 sec) · 3 Choose folders and where to back up (1 min).
4. **Features:** Automatic · Encrypted · Easy restore · Email reports.
5. **Your backups stay with you:** your disk ✓ · your Google Drive ✓ · Bakvion's servers ✕ never.
6. **Installing note:** the blue "Windows protected your PC" screen → More info → Run anyway.
7. **Talk to a Bakvion expert:** the enquiry form (§5).
8. **FAQ:** getting an account, offline use, membership ending, supported Windows.
9. **Final download call-to-action** + footer.

Behaviour:
- **Languages (builder's call):** routes `/` (English), `/hi`, `/gu`, statically generated; strings in `en.json`, `hi.json`, `gu.json` in a shared `packages/i18n` package (the desktop app adopts the same package in Project 2). `<html lang>` set per page. Hindi/Gujarati are first drafts for native review (spec §11).
- **Download link (builder's call):** public setting `NEXT_PUBLIC_DOWNLOAD_URL` (+ optional `NEXT_PUBLIC_DOWNLOAD_VERSION`, `NEXT_PUBLIC_DOWNLOAD_SIZE`). When empty, buttons show "Coming soon" (disabled). Project 4 fills it from the release pipeline.
- Responsive (390 px and up), WCAG AA, fast (no client JavaScript except the language switch and the form), good SEO title/description per language, Open Graph image.

## 5. Enquiry form ("Connect with Bakvion experts")

**Fields:** Name* · Business name* · Phone (WhatsApp)* · Email · City · Number of PCs (1–100) · Message (≤ 1000 chars). Hidden honeypot field (bots fill it; such submissions are silently accepted and discarded).
**Validation:** name/business 2–120 chars; phone 10–15 digits after removing spaces, `+`, `-`; email optional but valid if given.
**Success:** form is replaced by "Thank you! A Bakvion expert will contact you within 24 hours."
**Errors:** "No internet. Connect and try again." (app offline) · "Too many requests. Please try again later." · field messages. Typed values are kept.

**Where:**
- Website section §4.7 (posts to the server directly).
- Desktop app sign-in screen: under the sign-in card, "Don't have an account? **Connect with Bakvion experts**" → pop-up with the same form. **(builder's call)** The app sends it through the Bakvion service (new pipe method `submitLead` → service HTTPS call), the same path as sign-in, so no new desktop permissions are needed; the service adds its install ID and app version.

## 6. Server

- `POST /api/v1/leads` — JSON body `{ name, business, phone, email?, city?, pcs?, message?, source: "website" | "app", installId?, appVersion?, website? }` (`website` = honeypot). Responses: 200 `{ ok: true }`; 400 `bad_request` with field errors; 429 `rate_limited`.
- **Rate limits (builder's call):** 5 per IP per hour, 3 per install ID per hour, 200 global per hour (existing `rate_limits` table/functions).
- Saves the lead, then emails the owner via `nodemailer` with the existing SMTP settings. New env `LEADS_NOTIFY_EMAIL` (owner's address; defaults to `SMTP_USER`). Optional `PUBLIC_ADMIN_URL` to include a "Open Leads" link.
  - Subject: `New Bakvion enquiry — {Business name}`; body lists every field, source (Website / App), time in India, and IP.
  - **(builder's call)** If the email fails, the lead is still saved (`email_sent = false`, shown in the admin list) and the sender still sees success.
- Audit row `lead_received`.

## 7. Database (migration — needs owner approval before applying)

New file `supabase/migrations/202611100002_leads.sql` (owner runs it in the Supabase SQL editor):

`leads(id uuid pk default gen_random_uuid(), created_at timestamptz default now(), updated_at timestamptz default now(), source text check (source in ('website','app')), name text, business text, phone text, email text default '', city text default '', pcs int null check (pcs between 1 and 100), message text default '', status text default 'new' check (status in ('new','contacted','converted','not_interested')), email_sent boolean default false, ip text default '', install_id text default '', app_version text default '', client_id uuid null references clients(id) on delete set null)` + index on `(status, created_at desc)`. RLS on, all privileges revoked from `anon`/`authenticated` (same pattern as the accounts migration).

## 8. Admin panel — Leads

- New nav item **Leads** (between Clients and History) with a count badge of `new` leads.
- Leads page: DataTable — Received (date + relative), Name / Business, Phone, City, PCs, Source (Website / App badge), Status, Email sent warning icon if false. Search over name, business, phone, city. Filter tabs New / Contacted / Became client / Not interested / All.
- Row actions: status dropdown (SelectMenu, saves immediately), **Copy phone**, **Open WhatsApp** (`https://wa.me/<digits>`), **Create client** → opens the New client dialog prefilled with name, business, phone; on success the lead becomes `converted` and links to the new client.
- Lead detail (expand or side panel, builder's choice): full message.

## 9. Dependencies / approvals

- `nodemailer` (+ `@types/nodemailer` dev) in `@bakvion/web` — **owner-approved 2026-11-10**.
- New migration (§7) — approve with this document.
- No other new packages.

## 10. Testing

- Unit (vitest): lead validation, honeypot, rate limits, email composition (no real send — transport injected), status changes, create-client-from-lead marks converted.
- Database (PGlite): leads table, RLS/privileges, constraints.
- Go: `submitLead` pipe method + cloud client (httptest), offline error.
- Playwright: website renders in all three languages, form validation and success state with a mocked API; desktop sign-in screen opens the expert dialog and shows success (mocked IPC).
- Owner manual check: submit from website and from the app (CLI pipe call on Mac), email arrives at ishansavaliya787@gmail.com, lead shows in admin.

## 11. Left to the builder

Exact copy beyond the sections above, illustration details, component structure, i18n loader shape, email HTML layout.
