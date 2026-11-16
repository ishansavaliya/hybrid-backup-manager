# Accounts & Membership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-managed client accounts with password or one-time 6-digit-code sign-in, signed membership licenses enforced by the Windows service (fully offline until the synced expiry date), and the `/bkpadmin` admin panel.

**Architecture:** Next.js route handlers on Vercel are the only path to Supabase Postgres (server-side secret key; RLS on, no public grants). Atomic rules (single-use codes, PC limit) live in Postgres functions; everything else is plain TypeScript tested with an in-memory repository. The server signs Ed25519 license tokens; the Go service stores the device token + license in SQLite, verifies the signature with an embedded public key, evaluates membership locally against a clock high-water mark, gates backup methods, and refreshes in the background. The desktop UI only talks to the service over the existing pipe.

**Tech Stack:** Next.js 16 App Router, `@supabase/supabase-js` (already a dependency), Node `crypto` (scrypt, HMAC, Ed25519), Vitest, PGlite; Go 1.25 stdlib (`crypto/ed25519`, `net/http`), modernc SQLite; React 19 desktop; Playwright.

**Spec:** `docs/superpowers/specs/2026-11-09-bakvion-v1-design.md` (§7, §8, §12 version display, §14). Projects 2–4 are out of scope.

## Global Constraints

- Branch: `feat/accounts-membership` from `design/v1`. Never commit to `main`. No force push.
- Only new dependency: `vitest ^3.2.4` as devDependency of `@bakvion/web` (already in the workspace lockfile via `@bakvion/validation`). Anything else needs owner approval first.
- Membership timezone: Asia/Kolkata. An admin-chosen date `YYYY-MM-DD` means expiry at `YYYY-MM-DDT23:59:59+05:30`.
- Expiry badge window: 10 days. Sync warning: last sync older than 3 days.
- Login code: exactly 6 digits (leading zeros allowed), single use, expires 48 h after creation.
- Rate limits (window 900 s, failures counted): password sign-in 10/IP and 5/username; code sign-in 5/IP and 100 global; admin login 5 global.
- Offline: service works fully until the license `expiresAt`; no other offline time limit. Clock moved back more than 5 minutes below the high-water mark → restore-only until next successful sync.
- Expired / blocked / signed-out / removed → restore-only: `savePlan`, `startBackup`, `initRepository` refused with code `MEMBERSHIP_INACTIVE`; queued jobs fail with "Membership inactive: new backups are paused"; `overview`, `testDestination`, `snapshots`, `browse`, `check`, `restore` keep working. Nothing local is ever deleted by an account event.
- Expired/blocked clients may sign in (restore-only); restore-only devices do not count toward the PC limit.
- Secrets only in `apps/web/.env.local` / Vercel env, never `NEXT_PUBLIC_*`, never logged. Admin password compared in constant time.
- Server env names: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `BKP_ADMIN_USERNAME`, `BKP_ADMIN_PASSWORD`, `BKP_SESSION_SECRET`, `LICENSE_SIGNING_PRIVATE_KEY`, `CRON_SECRET` (SMTP vars exist but are Project 3).
- Admin panel English only; desktop strings English for now (Project 2 adds hi/gu and Graphite styling — reuse existing `@bakvion/ui` components, no restyling here).
- Owner rule: executor runs only fast unit tests (`vitest`, `go test`, `pnpm test:database`) unless the owner allows builds/e2e; the owner runs builds, Playwright and dev servers.
- Migration is applied to Supabase by the owner (SQL editor). Executor never runs DB CLIs.
- Out of scope here (later projects): recovery-kit restore without sign-in, per-PC backup results and email in the admin panel (Project 3); Graphite styling and hi/gu text (Project 2); version bump command and update checks (Project 4).

## Review Focus

1. **Two PCs signing in at the same moment with one slot left** → exactly one gets `full`. Test: last-slot + row-lock assertion in Task 1.
2. **Same PC signing in again (reinstall, re-login)** → reuses its device row, no extra slot. Test in Task 1.
3. **Windows clock set backwards to extend an expired membership** → restore-only. Test in Task 9.
4. **Tampered or foreign-key license in SQLite** → treated as no license (signed-out/restore-only), never full. Test in Task 9.
5. **Code typed with spaces / pasted "123 456"** → accepted; any non-6-digit input → `code_invalid` without touching the database. Test in Task 2.

---

### Task 1: Accounts database migration (replaces unused foundation schema)

The Supabase project is new and empty; the old `202611070001_foundation.sql` (Supabase-Auth model) was never applied and is replaced.

**Files:**
- Delete: `supabase/migrations/202611070001_foundation.sql`, `tests/database/rls.sql`
- Create: `supabase/migrations/202611100001_accounts.sql`
- Modify: `tests/database/run.mjs` (rewrite)

**Interfaces — Produces (SQL):**
- Tables: `clients(id uuid pk default gen_random_uuid(), name text not null, contact_person text not null default '', phone text not null default '', notes text not null default '', expires_at timestamptz not null, pc_limit int not null default 1 check (pc_limit between 1 and 100), blocked bool not null default false, is_test bool not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`
- `client_logins(client_id uuid pk references clients on delete cascade, username text not null, password_hash text not null, updated_at timestamptz not null default now())` + unique index on `lower(username)`
- `login_codes(id uuid pk, client_id uuid references clients on delete cascade, code_hmac text not null, created_at, expires_at timestamptz not null, used_at timestamptz, used_device_id uuid)` + unique index on `code_hmac where used_at is null`
- `devices(id uuid pk, client_id uuid references clients on delete cascade, install_id text not null, machine_name, windows_version, app_version text, mode text not null check (mode in ('full','restore_only')), first_seen_at, last_seen_at timestamptz, removed_at timestamptz)` + unique `(client_id, install_id)`
- `device_tokens(id uuid pk, device_id uuid references devices on delete cascade, token_hash text unique not null, created_at, revoked_at timestamptz)`
- `audit_log(id bigserial pk, at timestamptz default now(), actor text check (actor in ('admin','client','device','system')), client_id uuid null references clients on delete set null, device_id uuid null, action text not null, details jsonb not null default '{}', ip text not null default '')`
- `rate_limits(key text pk, window_start timestamptz not null, failures int not null)`
- `settings(key text pk, value text not null)` seeded with `('renew_contact','')`
- RLS enabled on every table; `revoke all` from `anon`, `authenticated`; no policies.
- `bkp_register_device(p_client_id uuid, p_install_id text, p_machine text, p_windows text, p_app_version text, p_token_hash text, p_now timestamptz) returns table(outcome text, device_id uuid, mode text, pc_limit int)` — locks the client row `for update`; mode = `restore_only` if client blocked or `expires_at < p_now`, else `full`; for `full`, counts devices with `mode='full' and removed_at is null and install_id <> p_install_id`; if count ≥ pc_limit → `('pc_limit', null, null, pc_limit)`; else upsert device on `(client_id, install_id)` (clear `removed_at`, set mode/last_seen/versions), insert token → `('ok', id, mode, pc_limit)`.
- `bkp_sign_in_with_code(p_code_hmac text, p_install_id text, p_machine text, p_windows text, p_app_version text, p_token_hash text, p_now timestamptz) returns table(outcome text, client_id uuid, device_id uuid, mode text, pc_limit int)` — selects the unused, unexpired code `for update`; none → `('code_invalid',…nulls)`; calls `bkp_register_device`; marks the code used only when outcome is `ok`.
- `bkp_rate_limited(p_key text, p_max int, p_window_seconds int, p_now timestamptz) returns boolean` and `bkp_record_failure(p_key text, p_window_seconds int, p_now timestamptz) returns void` (resets the window when expired).

- [ ] **Step 1: Write failing tests in `tests/database/run.mjs`** (PGlite; create roles `anon`, `authenticated`, apply migration). Assertions:
  - 8 public tables, all `rowsecurity = true`; `set role anon; select * from clients` throws.
  - Client with `pc_limit 1`: first `bkp_register_device` install `a` → `ok/full`; install `b` → `pc_limit`; install `a` again → `ok/full`, still 1 device row.
  - Expired client (`expires_at` yesterday): install `c` → `ok/restore_only`; full-device count unchanged.
  - Code: insert code hmac `h1` expiring in 48 h → `bkp_sign_in_with_code('h1', …)` → `ok`; same call again → `code_invalid`. Expired code → `code_invalid`. Code for client at PC limit → `pc_limit` and code still unused.
  - Last slot: inside one transaction, `bkp_register_device` for installs `x` then `y` on a fresh `pc_limit 1` client → `ok` then `pc_limit`; and `select pg_get_functiondef('bkp_register_device'::regproc) ilike '%for update%'` is true (PGlite has one connection, so the row lock is asserted structurally; true concurrency is covered by Postgres semantics of `for update`).
  - Rate limit: 5 × `bkp_record_failure('k',900,now)` → `bkp_rate_limited('k',5,900,now)` true; with `now + 901s` → false.
- [ ] **Step 2: Run `pnpm test:database`** → FAIL (migration file missing).
- [ ] **Step 3: Write the migration** per the Interfaces block; functions `security definer`, `set search_path = public`, execute revoked from `public, anon, authenticated`.
- [ ] **Step 4: Run `pnpm test:database`** → `PASS: accounts migration` line(s).
- [ ] **Step 5: Commit** `feat(db): accounts and membership schema`.

### Task 2: Server primitives (passwords, codes, tokens, membership, license signing)

**Files:**
- Modify: `apps/web/package.json` (add `"test": "vitest run"`, devDependency `vitest ^3.2.4`)
- Create: `apps/web/lib/server/passwords.ts`, `codes.ts`, `tokens.ts`, `membership.ts`, `license.ts`
- Create: `apps/web/scripts/generate-license-key.mjs`
- Test: `apps/web/lib/server/primitives.test.ts`

**Interfaces — Produces:**
- `hashPassword(plain: string): Promise<string>` — format `scrypt$16384$8$1$<saltB64>$<hashB64>`; `verifyPassword(plain: string, stored: string): Promise<boolean>` (timing-safe, false on malformed).
- `generateLoginCode(): string`; `normalizeLoginCode(input: string): string | null` (strip whitespace, `/^\d{6}$/`); `hashLoginCode(code: string, sessionSecret: string): string` — hex HMAC-SHA256 keyed by `HMAC(sessionSecret, "bakvion-login-code")`.
- `generateDeviceToken(): string` (32 random bytes, base64url); `hashToken(token: string): string` (sha256 hex).
- `EXPIRING_WINDOW_DAYS = 10`; `type MembershipStatus = "active" | "expiring" | "expired" | "blocked"`; `membershipStatus(c: { expiresAt: Date; blocked: boolean }, now: Date): MembershipStatus`; `daysLeft(expiresAt: Date, now: Date): number` (ceil, min 0); `endOfDayIST(date: string): Date`; `extendExpiry(current: Date, now: Date, months: number): Date` (from the later of current/now, calendar months, result normalized with `endOfDayIST`).
- `type LicensePayload = { v: 1; clientId: string; clientName: string; deviceId: string; status: "active" | "blocked"; expiresAt: string; issuedAt: string; renewContact: string }`; `signLicense(p: LicensePayload, privateKeyB64: string): string` → `base64url(JSON).base64url(signature)`; `verifyLicense(token: string, publicKeyB64: string): LicensePayload | null`.
- Script prints two lines: `LICENSE_SIGNING_PRIVATE_KEY=<base64 PKCS8 DER>` and `LICENSE_PUBLIC_KEY=<base64 raw 32-byte key>`.

- [ ] **Step 1: Write failing tests** — password round trip + wrong password false + malformed stored false; `normalizeLoginCode(" 123 456 ")==="123456"`, `"12345"`, `"12a456"`, `"1234567"` → null; `generateLoginCode()` matches `/^\d{6}$/` over 200 draws; same code+secret → same hash, different secret → different; `membershipStatus` at expiry−11 d `active`, −10 d `expiring`, +1 s `expired`, blocked wins; `endOfDayIST("2026-12-31").toISOString()==="2026-12-31T18:29:59.000Z"`; `extendExpiry` from an expired date extends from today; sign→verify round trip, flipped payload byte → null, other key → null.
- [ ] **Step 2: Run `pnpm --filter @bakvion/web test`** → FAIL.
- [ ] **Step 3: Implement** with Node `crypto` only (`scrypt`, `timingSafeEqual`, `createHmac`, `randomInt`, `generateKeyPairSync('ed25519')`, `sign(null, …)`).
- [ ] **Step 4: Run tests** → PASS.
- [ ] **Step 5: Commit** `feat(web): auth, membership and license primitives`.

### Task 3: Repository layer and server env

**Files:**
- Create: `apps/web/lib/server/env.ts`, `repo.ts` (types + interface), `repo-supabase.ts`
- Create: `apps/web/lib/server/testing/memory-repo.ts`
- Test: `apps/web/lib/server/memory-repo.test.ts`

**Interfaces — Produces:**
- `serverEnv(): ServerEnv` — `{ supabaseUrl, supabaseSecretKey, adminUsername, adminPassword, sessionSecret, licensePrivateKey, cronSecret }`; throws `"Missing server setting: <NAME>"` naming the missing variable (never its value).
- Types: `ClientRecord { id; name; contactPerson; phone; notes; expiresAt: Date; pcLimit: number; blocked: boolean; isTest: boolean; createdAt: Date }`; `ClientSummary = ClientRecord & { username: string | null; pcsUsed: number; lastSeenAt: Date | null }`; `DeviceRecord { id; clientId; installId; machineName; windowsVersion; appVersion; mode: "full" | "restore_only"; firstSeenAt: Date; lastSeenAt: Date; removedAt: Date | null }`; `DeviceInfo { installId; machineName; windowsVersion; appVersion }`; `RegisterOutcome = { outcome: "ok"; clientId: string; deviceId: string; mode: "full" | "restore_only" } | { outcome: "pc_limit"; pcLimit: number } | { outcome: "code_invalid" }`; `AuditEntry { actor: "admin" | "client" | "device" | "system"; action: string; clientId?: string; deviceId?: string; details?: Record<string, unknown>; ip?: string }`; `class UsernameTakenError extends Error`.
- `interface Repo`:
  - `findLogin(username: string): Promise<{ clientId: string; passwordHash: string } | null>` (case-insensitive)
  - `getClient(id: string): Promise<ClientRecord | null>`
  - `registerDevice(clientId: string, d: DeviceInfo, tokenHash: string, now: Date): Promise<RegisterOutcome>`
  - `signInWithCode(codeHmac: string, d: DeviceInfo, tokenHash: string, now: Date): Promise<RegisterOutcome>`
  - `deviceByToken(tokenHash: string): Promise<{ device: DeviceRecord; client: ClientRecord } | null>` (null if token revoked or device removed)
  - `touchDevice(deviceId: string, appVersion: string, now: Date): Promise<void>`
  - `revokeToken(tokenHash: string, now: Date): Promise<void>`
  - `rateLimited(key: string, max: number, windowSeconds: number, now: Date): Promise<boolean>`; `recordFailure(key: string, windowSeconds: number, now: Date): Promise<void>`
  - `audit(e: AuditEntry): Promise<void>`; `listAudit(opts: { clientId?: string; limit: number }): Promise<(AuditEntry & { id: number; at: Date })[]>`
  - `getSetting(key: "renew_contact"): Promise<string>`; `setSetting(key: "renew_contact", value: string): Promise<void>`
  - `listClients(): Promise<ClientSummary[]>`; `createClient(c: Omit<ClientRecord, "id" | "createdAt">): Promise<string>`; `updateClient(id: string, patch: Partial<Omit<ClientRecord, "id" | "createdAt">>): Promise<void>`; `deleteClient(id: string): Promise<void>`
  - `setLogin(clientId: string, username: string, passwordHash: string): Promise<void>` (throws `UsernameTakenError`)
  - `createLoginCode(clientId: string, codeHmac: string, expiresAt: Date): Promise<boolean>` (false on active-hash collision)
  - `listDevices(clientId: string): Promise<DeviceRecord[]>`; `removeDevice(deviceId: string, now: Date): Promise<void>` (sets `removed_at`, revokes its tokens)
  - `pruneAudit(olderThan: Date): Promise<number>`; `ping(): Promise<void>`
- `createSupabaseRepo(env: ServerEnv): Repo` — `createClient(url, secretKey, { auth: { persistSession: false } })`; RPCs for register/code/rate limit; maps snake_case rows to the types above.
- `createMemoryRepo(seed?: { clients?: ClientRecord[] }): Repo & { codes: Map<string, …>; devices: DeviceRecord[] }` — mirrors Task 1 SQL semantics exactly (PC-limit, restore-only no slot, code single use, 48 h).

- [ ] **Step 1: Write failing tests** for the memory repo reproducing every Task 1 SQL assertion (same scenarios, same outcomes) plus `serverEnv()` with one variable unset → error message contains the variable name.
- [ ] **Step 2: Run** `pnpm --filter @bakvion/web test` → FAIL.
- [ ] **Step 3: Implement** `env.ts`, `repo.ts`, `memory-repo.ts`, `repo-supabase.ts` (Supabase repo is covered by the owner's manual check in Task 12; keep it a thin mapping).
- [ ] **Step 4: Run tests** → PASS.
- [ ] **Step 5: Commit** `feat(web): repository layer`.

### Task 4: Device API (sign-in, license refresh, sign-out)

**Files:**
- Create: `apps/web/lib/server/device-api.ts`, `apps/web/lib/server/http.ts`
- Create: `apps/web/app/api/v1/device/sign-in/route.ts`, `license/route.ts`, `sign-out/route.ts`
- Test: `apps/web/lib/server/device-api.test.ts`

**Interfaces:**
- Consumes: Task 2 primitives, Task 3 `Repo`, `ServerEnv`.
- Produces (HTTP, JSON, `export const runtime = "nodejs"`, `dynamic = "force-dynamic"`):
  - `POST /api/v1/device/sign-in` body `{ method: "password", username, password, device: DeviceInfo } | { method: "code", code, device: DeviceInfo }` → 200 `{ deviceToken: string, license: string, mode: "full" | "restore_only" }`
  - `POST /api/v1/device/license` header `Authorization: Bearer <deviceToken>`, body `{ appVersion }` → 200 `{ license: string, mode }`
  - `POST /api/v1/device/sign-out` bearer → 200 `{ ok: true }`
  - Errors: `{ error: { code, message } }` with codes/status `bad_request` 400, `invalid_credentials` 401, `code_invalid` 401, `unauthorized` 401, `device_removed` 401, `pc_limit` 409 (message includes the limit), `rate_limited` 429.
- TS functions: `signIn(repo: Repo, env: ServerEnv, body: unknown, ctx: { ip: string; now: Date }): Promise<ApiResult>`; `refreshLicense(repo, env, bearer: string | null, body: unknown, ctx): Promise<ApiResult>`; `signOut(repo, bearer, ctx): Promise<ApiResult>`; `type ApiResult = { status: number; body: unknown }`; `clientIp(req: Request): string` (first `x-forwarded-for` entry, else `x-real-ip`, else `""`).
- Validation: `installId` `/^[a-f0-9]{32}$/`; machineName/windowsVersion ≤ 64 chars; appVersion ≤ 32; username ≤ 64; password ≤ 256; body ≤ 8 KiB.
- License status: `blocked` if client blocked else `active`; `renewContact` from settings; `issuedAt` = `now`.
- Audit actions: `sign_in`, `sign_in_failed`, `code_used`, `code_failed`, `license_refresh` (no audit row for routine refresh — only `last_seen_at`), `sign_out`.

- [ ] **Step 1: Write failing tests** (memory repo, fixed `now`, generated test keypair):
  - password ok → 200, license verifies with public key, payload `deviceId`/`expiresAt` match; wrong password → 401 `invalid_credentials` and failure recorded; 6th wrong try for one username within 900 s → 429 even with the right password.
  - code ok → 200; reuse → 401 `code_invalid`; `"12 34 56"` accepted; `"abc"` → 401 `code_invalid` with zero repo calls besides rate limit; 6th failing code from one IP → 429.
  - PC limit reached → 409 `pc_limit`, message contains "1".
  - expired client sign-in → 200 `mode: "restore_only"`; blocked client license `status: "blocked"`.
  - refresh: valid token → 200 and `touchDevice` called; removed device → 401 `device_removed`; garbage bearer → 401 `unauthorized`.
  - sign-out revokes token; refresh afterwards → 401 `device_removed`.
  - malformed JSON / missing device → 400.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `device-api.ts`; routes are thin: parse `req`, call function with `createSupabaseRepo(serverEnv())`, return `Response.json(body, { status })`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(web): device sign-in and license API`.

### Task 5: Admin authentication

**Files:**
- Create: `apps/web/lib/server/admin-session.ts`
- Create: `apps/web/app/bkpadmin/login/page.tsx`, `apps/web/app/bkpadmin/auth-actions.ts`
- Create: `apps/web/app/bkpadmin/(panel)/layout.tsx`
- Test: `apps/web/lib/server/admin-session.test.ts`

**Interfaces — Produces:**
- `ADMIN_COOKIE = "bkp_admin"`; `ADMIN_SESSION_HOURS = 12`.
- `checkAdminCredentials(username: string, password: string, env: ServerEnv): boolean` (sha256 both sides + `timingSafeEqual`, both must match).
- `createAdminSession(env: ServerEnv, now: Date): string` → `<expiresMs>.<hex HMAC(sessionSecret, "admin:" + expiresMs)>`; `verifyAdminSession(value: string | undefined, env: ServerEnv, now: Date): boolean`.
- `requireAdmin(): Promise<void>` (server-only; reads cookie via `cookies()`, `redirect("/bkpadmin/login")` when invalid).
- Server actions: `loginAction(formData)` — if `repo.rateLimited("admin:login", 5, 900)` → error "Too many attempts. Try again in 15 minutes."; wrong → `recordFailure` + audit `admin_login_failed` + "Wrong username or password"; right → set cookie (`httpOnly`, `secure` when `NODE_ENV==="production"`, `sameSite: "strict"`, `path: "/"`, maxAge 12 h) + audit `admin_login` + redirect `/bkpadmin`. `logoutAction()` deletes cookie.
- `(panel)/layout.tsx` calls `requireAdmin()`; renders nav: Clients, History, Settings, Sign out. All `/bkpadmin` pages export `metadata.robots = { index: false, follow: false }`.

- [ ] **Step 1: Write failing tests** — correct creds true; wrong username / wrong password / different-length strings false; session verifies before expiry, fails after 12 h, fails with tampered HMAC, fails with another secret, fails for `undefined`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(web): admin authentication`.

### Task 6: Admin panel — clients, membership, credentials, codes, PCs, history, settings

**Files:**
- Create: `apps/web/lib/server/admin-service.ts`
- Create: `apps/web/app/bkpadmin/actions.ts` (server actions; each starts with `await requireAdmin()`)
- Create: `apps/web/app/bkpadmin/(panel)/page.tsx` (clients list), `clients/new/page.tsx`, `clients/[id]/page.tsx`, `history/page.tsx`, `settings/page.tsx`
- Create: `apps/web/app/bkpadmin/(panel)/CopyButton.tsx` (client component, clipboard)
- Test: `apps/web/lib/server/admin-service.test.ts`

**Interfaces — Produces (`admin-service.ts`, all write an `admin` audit row):**
- `createClientAccount(repo, input: { name; contactPerson; phone; notes; expiresOn: string; pcLimit: number; isTest: boolean }, now): Promise<string>`
- `updateClientDetails(repo, id, patch: { name?; contactPerson?; phone?; notes?; isTest? }): Promise<void>`
- `setExpiryDate(repo, id, date: string): Promise<void>`; `extendMembership(repo, id, months: 1 | 3 | 12, now): Promise<Date>`
- `setPcLimit(repo, id, limit: number): Promise<void>` (1–100)
- `setCredentials(repo, id, username: string, password: string): Promise<void>` (username `/^[a-zA-Z0-9._-]{3,64}$/`, password ≥ 8 chars; maps `UsernameTakenError` → "Username already in use")
- `issueLoginCode(repo, env, id, now): Promise<{ code: string; expiresAt: Date; whatsappText: string }>` — retries up to 5 times on collision; whatsapp text exactly: `Your Bakvion sign-in code is {code}. It works once and expires on {DD MMM YYYY, h:mm a} IST. Open Bakvion → Sign in → 6-digit code.`
- `setBlocked(repo, id, blocked: boolean)`; `removeClientDevice(repo, deviceId, now)`; `deleteTestClient(repo, id)` (refuses when `isTest` false)
- `setRenewContact(repo, text: string)` (≤ 500 chars)
- `filterClients(list: ClientSummary[], q: string, filter: "all" | "expiring" | "expired" | "blocked" | "test", now): ClientSummary[]`

Pages (server components, `dynamic = "force-dynamic"`, existing `@bakvion/ui` `Card`/`Button`/`Badge`):
- Clients list: search box + filter tabs (`?q=&filter=`); columns Name, Phone, Status badge, Expires (date + "N days left"), PCs used/limit, Last seen; "New client" button.
- Client detail: details form; Membership (date input + "+1 month / +3 months / +1 year"); PC limit; Username/password form; "Generate 6-digit code" → shows code, expiry and the WhatsApp text with Copy button (code shown once, never stored in plain text); PCs table (machine, Windows, app version, mode, last seen "N days ago", Remove); Block/Unblock; Delete (test clients only); recent history for this client.
- History: latest 200 audit rows, filter by client.
- Settings: renew-contact text (shown to clients on expiry).

- [ ] **Step 1: Write failing tests** for every `admin-service` function with the memory repo: create → status `active`; `extendMembership(…,1)` on a client expired last week → expiry one month from today 23:59:59 IST; duplicate username → "Username already in use"; `issueLoginCode` returns 6 digits, stored hash ≠ code, `expiresAt = now + 48 h`, WhatsApp text contains the code; removing a device makes `deviceByToken` return null; `deleteTestClient` on non-test throws; `filterClients` "expiring" returns only clients within 10 days and not expired; each mutating call adds one audit row with `actor: "admin"`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement service, actions and pages.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(web): admin panel`.

### Task 7: Remove client web dashboard, keepalive cron, env example

**Files:**
- Delete: `apps/web/app/Dashboard.tsx`
- Modify: `apps/web/app/page.tsx` (minimal public page: brand, one sentence, "Download coming soon" — real site is Project 4)
- Create: `apps/web/app/api/cron/keepalive/route.ts`
- Modify: `apps/web/vercel.json` (add `"crons": [{ "path": "/api/cron/keepalive", "schedule": "0 3 * * *" }]`)
- Create: `apps/web/.env.example` (all variable names from Global Constraints, empty values, one comment line each)
- Test: `apps/web/lib/server/keepalive.test.ts`

**Interfaces — Produces:** `runKeepalive(repo: Repo, now: Date): Promise<{ pruned: number }>` — `ping()` then `pruneAudit(now − 90 days)`. Route: `GET`, requires `Authorization: Bearer ${CRON_SECRET}` else 401.

- [ ] **Step 1: Failing test** — audit rows 91 days old pruned, 89 days kept; route function rejects missing/wrong bearer.
- [ ] **Step 2–4: Run → FAIL, implement, run → PASS.** Also `pnpm --filter @bakvion/web typecheck` clean (no remaining `NEXT_PUBLIC_SUPABASE_ANON_KEY` references).
- [ ] **Step 5: Commit** `feat(web): public placeholder, keepalive cron, env example`.

### Task 8: Go license verification and evaluation

**Files:**
- Create: `services/agent/internal/license/license.go`, `evaluate.go`, `key.go`
- Test: `services/agent/internal/license/license_test.go`

**Interfaces — Produces:**
- `type Payload struct { V int \`json:"v"\`; ClientID string \`json:"clientId"\`; ClientName string \`json:"clientName"\`; DeviceID string \`json:"deviceId"\`; Status string \`json:"status"\`; ExpiresAt time.Time \`json:"expiresAt"\`; IssuedAt time.Time \`json:"issuedAt"\`; RenewContact string \`json:"renewContact"\` }`
- `func Verify(token string, pub ed25519.PublicKey) (Payload, error)` — splits on `.`, base64url (no padding) decode, `ed25519.Verify`, rejects `V != 1`.
- `var PublicKeyBase64 string` (set in `key.go`, overridable with `-ldflags -X`); `func DefaultPublicKey() (ed25519.PublicKey, error)`.
- `type Mode string` — `ModeFull = "full"`, `ModeRestoreOnly = "restore_only"`, `ModeSignedOut = "signed_out"`.
- `type State struct { Mode Mode; Reason string /* "", "expired", "blocked", "clock", "signed_out" */; ExpiresAt *time.Time; DaysLeft int; ShowBadge bool }`
- `const BadgeDays = 10; const ClockSkew = 5 * time.Minute`
- `func Evaluate(p *Payload, now, highWater time.Time) State` — order: nil → signed_out; `now < highWater − ClockSkew` → restore_only/clock; blocked → restore_only/blocked; `now > ExpiresAt` → restore_only/expired; else full with `DaysLeft` = ceil days, `ShowBadge = DaysLeft <= 10`.

- [ ] **Step 1: Failing tests** — token produced by Go test helper `signForTest(priv, Payload)` using the same wire format as Task 2 verifies; one flipped byte fails; other key fails; `V: 2` fails; Evaluate table: active 30 d (full, no badge), 6 d (full, badge, DaysLeft 6), expired 1 s (restore_only/expired), blocked (restore_only/blocked), now 10 min before highWater (restore_only/clock), nil (signed_out). Cross-language check: a fixed token + public key generated once by `apps/web/scripts/generate-license-key.mjs` and signed with `signLicense` stored as test vector `testdata/vector.json` must verify.
- [ ] **Step 2: Run `go -C services/agent test ./internal/license/`** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(agent): license verification and evaluation`.

### Task 9: Go cloud client, account store and agent integration

**Files:**
- Create: `services/agent/internal/cloud/client.go`; Test: `services/agent/internal/cloud/client_test.go`
- Create: `services/agent/internal/core/migrations/002_account.sql`
- Modify: `services/agent/internal/core/store.go` (sequential migrations 1→2; reject > 2)
- Create: `services/agent/internal/core/account.go`; Test: `services/agent/internal/core/account_test.go`
- Modify: `services/agent/internal/core/agent.go` (fields, gating, `next()` check, new methods), `types.go` (error code)
- Modify: `services/agent/internal/core/integration_test.go` (construct agents through helper `licensedAgent(t, store, engine)`; `TestFutureSchemaRejected` expects newer than 2)
- Create: `services/agent/internal/core/testhelpers_test.go`

**Interfaces:**
- Consumes: Task 8 `Verify`, `Evaluate`, `State`, `Mode`; Task 4 HTTP contract.
- Produces (`cloud`): `var DefaultBaseURL = "http://localhost:3000"` (ldflags); `type DeviceInfo struct { InstallID, MachineName, WindowsVersion, AppVersion string }` (json `installId` …); `type SignInRequest struct { Method, Username, Password, Code string; Device DeviceInfo }`; `type SignInResult struct { DeviceToken, License, Mode string }`; `type APIError struct { Status int; Code, Message string }` (implements `error`); `var ErrOffline = errors.New("server unreachable")`; `type Client struct { BaseURL string; HTTP *http.Client }` with `SignIn(ctx, SignInRequest) (SignInResult, error)`, `RefreshLicense(ctx, token, appVersion string) (string, error)`, `SignOut(ctx, token string) error`. Network/timeout/5xx errors wrap `ErrOffline`; 4xx decode to `*APIError`. Timeout 20 s.
- Produces (`core`):
  - SQLite `account(id INTEGER PRIMARY KEY CHECK (id = 1), install_id TEXT NOT NULL, device_token TEXT, license_token TEXT, last_sync_at TEXT, high_water TEXT NOT NULL)`; migration inserts the row with `lower(hex(randomblob(16)))` and current UTC time.
  - `type CloudAPI interface { SignIn(context.Context, cloud.SignInRequest) (cloud.SignInResult, error); RefreshLicense(context.Context, string, string) (string, error); SignOut(context.Context, string) error }`
  - `Agent` gains `Cloud CloudAPI; LicenseKey ed25519.PublicKey; Clock func() time.Time; AppVersion string; MachineInfo func() (machine, windows string)`.
  - `var ErrMembershipInactive = errors.New("Membership inactive: new backups are paused")`; `Handle` maps it to code `MEMBERSHIP_INACTIVE`; `*cloud.APIError` maps to its upper-cased code (e.g. `INVALID_CREDENTIALS`, `PC_LIMIT`); `ErrOffline` → `OFFLINE`.
  - `type AccountStatus struct { SignedIn bool \`json:"signedIn"\`; Mode license.Mode \`json:"mode"\`; Reason string \`json:"reason"\`; ClientName string \`json:"clientName"\`; ExpiresAt *time.Time \`json:"expiresAt"\`; DaysLeft int \`json:"daysLeft"\`; ShowBadge bool \`json:"showBadge"\`; RenewContact string \`json:"renewContact"\`; LastSyncAt *time.Time \`json:"lastSyncAt"\`; DaysSinceSync int \`json:"daysSinceSync"\`; SyncWarning bool \`json:"syncWarning"\`; InstallID string \`json:"installId"\`; AppVersion string \`json:"appVersion"\` }` — `SyncWarning` when signed in and last sync older than 3 days.
  - `func (a *Agent) AccountStatus() (AccountStatus, error)` — invalid stored license → treated as nil payload; advances `high_water` to max(stored, now).
  - `func (a *Agent) SignIn(ctx, method, username, password, code string) (AccountStatus, error)`; `func (a *Agent) SignOut(ctx) error` (server call best-effort; local session cleared even offline; plans untouched); `func (a *Agent) Refresh(ctx) error` (no token → nil; success saves license, `last_sync_at = now`, high-water = max(current, payload.IssuedAt); `device_removed`/`unauthorized` → clear session); `func (a *Agent) LicenseLoop(ctx context.Context)` (refresh at start; then every 6 h after success, every 5 min after failure).
  - Pipe methods: `accountStatus`, `signIn` (params `{ method, username, password, code }`), `signOut`, `refreshLicense` (returns `AccountStatus`).
  - Gating: `savePlan`, `startBackup`, `initRepository` require `ModeFull`; `next()` marks a queued job `failed` with `ErrMembershipInactive` text when not full.
  - Dev bypass: file `core/devbypass_on.go` (`//go:build bakvion_dev`) sets `const devBypass = true`; `devbypass_off.go` (`!bakvion_dev`) false. When true and env `BAKVION_DEV_UNLICENSED=1`, gating is skipped. Release builds never use the tag; `tests/cli-smoke.py` docs say build with `-tags bakvion_dev`.

- [ ] **Step 1: Failing cloud tests** (`httptest.Server`): sign-in success decodes result; 401 body → `*APIError{Code:"invalid_credentials"}`; closed server → `errors.Is(err, ErrOffline)`; refresh sends `Authorization: Bearer t1` and `appVersion`.
- [ ] **Step 2: Failing core tests** (fake `CloudAPI`, test keypair, controllable `Clock`):
  - fresh store → `accountStatus` signed_out, `installId` 32 hex chars stable across reopen.
  - sign-in → full; `savePlan` allowed.
  - offline (fake returns `ErrOffline`) for 40 days with expiry 60 days away → still full, `daysSinceSync` 40, `syncWarning` true.
  - clock moved past expiry → `savePlan` returns `MEMBERSHIP_INACTIVE`; `restore`/`snapshots` still dispatched (no membership error).
  - clock set back 1 h below high-water → mode restore_only, reason clock; successful refresh → full again.
  - refresh returns `device_removed` → signed_out; existing plans still listed in `overview`.
  - queued job + license expires before `Work` → job state `failed`, error text "Membership inactive: new backups are paused".
  - tampered `license_token` in SQLite → signed_out.
  - `OpenStore` on a version-1 database migrates to 2 keeping existing plans.
- [ ] **Step 3: Run `go -C services/agent test ./...`** → FAIL.
- [ ] **Step 4: Implement** cloud client, migration, store methods, account.go, gating, helper; update integration tests to `licensedAgent`.
- [ ] **Step 5: Run `BAKVION_TEST_RESTIC=$(which restic) go -C services/agent test ./...` and `go -C services/agent vet ./...`** → PASS, no skips.
- [ ] **Step 6: Commit** `feat(agent): account, licensing and membership enforcement`.

### Task 10: Wire licensing into the CLI and Windows service

**Files:**
- Modify: `services/agent/cmd/bakvion/main.go` (`var version = "0.1.0"` ldflags; flag `--server` default env `BAKVION_SERVER_URL` else `cloud.DefaultBaseURL`; build `Agent` with `cloud.Client`, `license.DefaultPublicKey()`, `time.Now`, `version`, `machineInfo`)
- Modify: `services/agent/cmd/bakvion/platform_windows.go` (`serve` starts `go a.LicenseLoop(ctx)`; `machineInfo()` via `windows.RtlGetVersion` + `os.Hostname`)
- Modify: `services/agent/cmd/bakvion/platform_other.go` (`machineInfo()` returns hostname and `runtime.GOOS`)
- Modify: `services/agent/internal/core/agent.go` (`overview` status `version` uses `a.AppVersion`)
- Modify: `scripts/build-agent.ps1`, `scripts/build-local.sh` (pass `-ldflags "-X …/license.PublicKeyBase64=$env:BAKVION_LICENSE_PUBLIC_KEY -X …/cloud.DefaultBaseURL=$env:BAKVION_SERVER_URL -X main.version=<root package.json version>"`; fail the build when the public key is empty)
- Modify: `tests/cli-smoke.py` (sets `BAKVION_DEV_UNLICENSED=1`; docstring says build with `-tags bakvion_dev`)

- [ ] **Step 1: Test** — `go -C services/agent build -tags bakvion_dev -o ../../artifacts/bakvion-dev ./cmd/bakvion` succeeds; `echo '{"version":1,"method":"accountStatus"}' | artifacts/bakvion-dev --state <tmp>/a.db request` prints `"mode":"signed_out"`; `GOOS=windows go -C services/agent vet ./...` clean.
- [ ] **Step 2: Implement.** **Step 3: Re-run the Step 1 commands** → expected output.
- [ ] **Step 4: Commit** `feat(agent): license loop in service and CLI wiring`.

### Task 11: Desktop sign-in, membership badge, sync signal, restore-only mode

**Files:**
- Modify: `packages/shared-types/src/index.ts` (add `AccountMode`, `AccountStatus` mirroring Go JSON, `SignInParams = { method: "password"; username: string; password: string } | { method: "code"; code: string }`)
- Modify: `apps/desktop/src/api.ts` (throw `AgentRequestError extends Error { code: string }`)
- Create: `apps/desktop/src/account/useAccount.ts`, `SignIn.tsx`, `MembershipBadge.tsx`, `SyncIndicator.tsx`, `AccountPanel.tsx`, `RestoreOnlyNotice.tsx`, `messages.ts`
- Modify: `apps/desktop/src/App.tsx` (gate + header + Settings section)
- Test: `tests/e2e/account.spec.ts` (Playwright with mocked `window.__TAURI_INTERNALS__.invoke`), keep `tests/e2e/offline.spec.ts` passing

**Interfaces:**
- `useAccount(): { status: AccountStatus | null; loading: boolean; error: string; reload(): Promise<void>; signIn(p: SignInParams): Promise<void>; signOut(): Promise<void>; syncNow(): Promise<void> }` (polls `accountStatus` every 60 s).
- `errorMessage(code: string, fallback: string): string` in `messages.ts`: `INVALID_CREDENTIALS` "Wrong username or password.", `CODE_INVALID` "This code is wrong, already used, or expired. Ask your Bakvion provider for a new one.", `PC_LIMIT` "Your plan's PC limit is reached. Contact your Bakvion provider.", `RATE_LIMITED` "Too many attempts. Wait 15 minutes and try again.", `OFFLINE` "No internet connection. Connect to the internet and try again.", `MEMBERSHIP_INACTIVE` "Your membership is not active. You can still restore existing backups."
- Behaviour:
  - `signed_out` and no plans → full-screen `SignIn` (segmented "Username" | "6-digit code"; six single-digit inputs with auto-advance, backspace-back, paste of 6 digits fills all; "No account? Contact your Bakvion provider.").
  - `signed_out` with plans, or `restore_only` → app shell with `RestoreOnlyNotice` (reason text: expired "Your membership has expired.", blocked "Your account is paused.", clock "Your PC clock looks wrong. Connect to the internet to verify.", signed_out "You are signed out."), renew contact, buttons "Sync now" and (signed_out) "Sign in"; "Create backup plan" and "Back up now" disabled; Recovery works.
  - `full` + `showBadge` → header badge "Membership expires in {n} days — please renew" (n = 1 → "1 day"); click reveals renew contact.
  - `syncWarning` → header indicator "Not synced for {n} days — connect to the internet".
  - Settings tab `AccountPanel`: client name, mode, expiry date, "Last synced: today / 1 day ago / {n} days ago / never", "Sync now", "Sign out" (confirm dialog), app version.
- [ ] **Step 1: Write failing Playwright tests** (owner runs Playwright; executor writes them): signed-out → sign-in visible, code tab shows 6 inputs, pasting "481920" fills them, submit invokes `agent_request` with `{method:"signIn", params:{method:"code", code:"481920"}}`; `CODE_INVALID` error shows its message; full with `daysLeft 6, showBadge` → badge text "Membership expires in 6 days — please renew"; `syncWarning, daysSinceSync 4` → "Not synced for 4 days — connect to the internet"; restore_only/expired → notice visible, "Create backup plan" disabled, Recovery tab reachable; Settings shows "Last synced: 4 days ago" and "Sync now" invokes `refreshLicense`.
- [ ] **Step 2: Implement** types, api error, account components, App integration (keep the existing disconnected-service path untouched when `accountStatus` itself fails).
- [ ] **Step 3: Executor runs `pnpm typecheck && pnpm lint`** → clean. Owner runs `pnpm test:e2e` → all pass.
- [ ] **Step 4: Commit** `feat(desktop): sign-in, membership badge, sync signal, restore-only mode`.

### Task 12: Owner setup and end-to-end check (owner runs; executor prepares)

- [ ] **Step 1 (executor):** run `node apps/web/scripts/generate-license-key.mjs`; write `LICENSE_SIGNING_PRIVATE_KEY` and a generated `CRON_SECRET` into `apps/web/.env.local` (owner authorized); put the public key into `services/agent/internal/license/key.go` `PublicKeyBase64`; commit `key.go` only.
- [ ] **Step 2 (owner):** paste `supabase/migrations/202611100001_accounts.sql` into Supabase → SQL Editor → Run; paste `SUPABASE_SECRET_KEY` into `.env.local`.
- [ ] **Step 3 (owner):** `pnpm dev:web` → `http://localhost:3000/bkpadmin` → sign in → create test client (tag Test, expiry in 6 days, PC limit 1) → set username/password → generate code.
- [ ] **Step 4 (owner):** build `go -C services/agent build -tags bakvion_dev -o ../../artifacts/bakvion-dev ./cmd/bakvion`; with `BAKVION_SERVER_URL=http://localhost:3000` send `{"version":1,"method":"signIn","params":{"method":"code","code":"<code>"}}` → `mode":"full"`, `showBadge":true`; admin panel shows the PC with last seen "today"; second sign-in with the same code → `CODE_INVALID`; block client → `refreshLicense` → `restore_only`; unblock → full; remove PC → `signed_out`.
- [ ] **Step 5:** update `docs/PROGRESS.md` and `docs/PRODUCTION_READINESS.md` with only the results actually observed; commit `docs: record accounts milestone evidence`.
