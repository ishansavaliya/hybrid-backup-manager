# Admin Panel Graphite Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the whole `/bkpadmin` admin panel (login, layout, tables, forms, detail pages) in the approved Graphite design, light and dark, with proper data tables.

**Architecture:** Graphite design tokens live in one shared stylesheet in `@bakvion/ui` (so the desktop app reuses them in Project 2), scoped under a `.gx` root class so the old green styles elsewhere are untouched. Admin-only React UI kit components live in `apps/web/app/bkpadmin/ui/`. Tables use TanStack Table (headless) wrapped in one `DataTable` component. Server actions, services and data flow from Project 1 stay unchanged — this is presentation only.

**Tech Stack:** Next.js 16 App Router, React 19, `@tanstack/react-table` v8 (owner-approved 2026-11-10), `next/font/google` (Manrope, built into Next — no new package), `lucide-react` (existing), Playwright (existing).

**Spec:** `docs/superpowers/specs/2026-11-09-bakvion-v1-design.md` §10 (Graphite) and §8 (admin panel).

## Global Constraints

- Branch `feat/accounts-membership` (owner: all work on this one branch until its pull request). Never commit to `main`. No force push.
- Only new dependency: `@tanstack/react-table` (^8) in `@bakvion/web`.
- Graphite tokens (verbatim from spec §10): dark bg `#121417`, panel `#181b1f`, border `#23272e`, text `#e8e9ec`, muted `#7d838e`; light bg `#f6f5f2`, panel `#ffffff`, border `#e7e4de`, text `#15171a`, muted `#6c717a`; accent saffron `#ff8a1f` (dark) / `#f07a0f` (light); success green, warning amber; panel radius 14px; Manrope typeface.
- Theme: first visit follows the OS (`prefers-color-scheme`); toggle in top bar persists in `localStorage` key `bkp-admin-theme` (`"light" | "dark"`), applied before paint (no flash).
- No behaviour changes: every form keeps posting to the same server action with the same field names; every page keeps `await requireAdmin()` first; `dynamic = "force-dynamic"` stays.
- Old green styles must not leak into `/bkpadmin` and Graphite must not change the desktop app or public page.
- Accessibility: WCAG AA contrast in both themes, visible focus ring (accent), labels on every input, keyboard-usable tables (sortable headers are buttons with `aria-sort`).
- Responsive: usable at 1280 px and down to 390 px wide (sidebar collapses to a top menu button under 900 px; tables scroll horizontally inside their card).
- English only. No fake data.
- Owner reviews visually; each task saves Playwright screenshots (light + dark) to `/private/tmp/claude-501/-Users-ishansavaliya-Documents-My-Coding-Project-Bakvion/1fb4e377-d580-42c4-90bf-e8ae26c7f025/scratchpad/admin-shots/`.

## Review Focus

1. A long client name / notes / phone breaks the layout → text wraps or truncates with title tooltip; layout never overflows the viewport.
2. Empty tables (no clients, no PCs, no history) → friendly empty state, no broken table chrome.
3. `?error=` / `?ok=` messages → visible toast/notice in both themes, dismissible, never hidden behind the header.
4. Dark mode on first load with OS dark → no white flash, inputs/date pickers readable (`color-scheme: dark`).
5. Password eye toggle → toggles `type` between `password`/`text`, has `aria-label` "Show password"/"Hide password", never submits the form.

---

### Task 1: Graphite foundation, admin shell, login page

**Files:**
- Create: `packages/ui/src/graphite.css` (tokens for light/dark under `.gx`, `[data-theme="dark"] .gx` / `.gx[data-theme="dark"]`, base element styles inside `.gx`, focus ring, scrollbar, `color-scheme`)
- Modify: `packages/ui/package.json` (export `"./graphite.css"`)
- Create: `apps/web/app/bkpadmin/ui/` — `Button.tsx` (variants `primary` | `secondary` | `ghost` | `danger`, sizes `sm` | `md`, `asChild`-free: accepts `href` to render a `Link`), `Card.tsx` (`Card`, `CardHeader` with title/description/actions), `Field.tsx` (`Field` label+hint+error wrapper, `Input`, `Textarea`, `Select`, `Checkbox`/`Switch`), `PasswordInput.tsx` (client; eye/eye-off lucide toggle), `Badge.tsx` (`Badge` tones `neutral|success|warning|danger|accent`, `StatusBadge` mapping `active|expiring|expired|blocked|test`), `Notice.tsx` (client; reads `ok`/`error` props, dismissible toast top-right), `PageHeader.tsx` (title, subtitle, actions, optional back link), `EmptyState.tsx`, `ThemeToggle.tsx` (client), `index.ts`
- Create: `apps/web/app/bkpadmin/ui/theme-script.ts` (inline script string applied in `<head>` via `bkpadmin/layout.tsx` to set `data-theme` before paint)
- Modify: `apps/web/app/bkpadmin/layout.tsx` (Manrope via `next/font/google`, `.gx` root wrapper, theme script, robots metadata kept)
- Modify: `apps/web/app/bkpadmin/(panel)/layout.tsx` (sidebar: brand mark (saffron conic logo as in mockup), nav Clients / History / Settings with lucide icons and active state; top bar: page area title slot, ThemeToggle, admin name, Sign out button posting to existing `logoutAction`; content max-width 1200px, padding 32px desktop / 16px mobile; under 900px sidebar becomes a slide-in menu opened by a top-bar button)
- Modify: `apps/web/app/bkpadmin/login/page.tsx`, `LoginForm.tsx` (centered card on Graphite background, logo, "Admin sign in" heading, subtitle "Bakvion owner panel", Username input, `PasswordInput`, primary button with pending state "Signing in…", error notice; same `loginAction`, same field names)
- Test: `tests/e2e/admin-login.spec.ts` + Playwright project/config entry to run against `pnpm --filter @bakvion/web dev` on port 3000 (only routes that need no database: `/bkpadmin/login`)

- [ ] **Step 1: Write failing Playwright tests** — `/bkpadmin/login` shows heading "Admin sign in"; password input type `password`; click "Show password" → type `text` and button label "Hide password"; click again → `password`; the toggle has `type="button"`; with `colorScheme: "dark"` the `.gx` root has `data-theme="dark"`; clicking the theme toggle switches and persists after reload. Save screenshots `login-light.png`, `login-dark.png`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS; web typecheck, root lint, web build clean (restore `apps/web/next-env.d.ts` import lines to `./.next/dev/types/...` by editing; never git).
- [ ] **Step 5: Commit** `feat(admin): Graphite foundation, shell and login`.

### Task 2: Data tables (Clients list, History)

**Files:**
- Modify: `apps/web/package.json` (add `@tanstack/react-table` ^8), lockfile
- Create: `apps/web/app/bkpadmin/ui/DataTable.tsx` (client; props `columns`, `data`, `initialSort?`, `searchPlaceholder?`, `toolbar?` (ReactNode for filter tabs), `pageSize` default 20, `emptyTitle`, `emptyDescription`, `getRowHref?(row)` making the whole row a link with keyboard support; sortable headers as buttons with `aria-sort` and lucide arrows; global text search; pagination "Showing a–b of n" + prev/next; sticky header; horizontal scroll inside card)
- Create: `apps/web/app/bkpadmin/ui/table-utils.ts` (pure helpers: `compareValues`, `matchesQuery(row, query, keys)`, `pageWindow(total, pageIndex, pageSize)`) + `table-utils.test.ts` (vitest)
- Modify: `apps/web/app/bkpadmin/(panel)/page.tsx` + new `ClientsTable.tsx` (client) — columns Name (with Test badge), Phone, Status (StatusBadge), Expires (date + "N days left" / "Expired N days ago"), PCs (used/limit), Last seen ("today / N days ago / never"); filter tabs All / Expiring / Expired / Blocked / Test as segmented control with counts; search over name, phone, username; row click → client page; "New client" primary button in PageHeader. Server component still loads data and passes plain serialisable rows (ISO strings, no Date objects across the boundary).
- Modify: `apps/web/app/bkpadmin/(panel)/history/page.tsx` + new `HistoryTable.tsx` — columns When (date-time IST + relative), Actor (Badge), Action (human label map, e.g. `sign_in` → "Signed in", `code_used` → "Code used", `admin_login` → "Admin signed in", unknown → raw), Client (link when present), IP, Details (compact key: value chips, no raw JSON blob); client filter kept via `?client=` (validated, existing behaviour).

- [ ] **Step 1: Failing vitest** for table-utils (string/number/date/null ordering, case-insensitive match on chosen keys, page window bounds incl. empty).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** helpers, DataTable, both tables. **Step 4:** vitest PASS; typecheck, lint, web build clean; screenshot clients list + history (empty states) light/dark using a minted admin session cookie (`createAdminSession(serverEnv(), new Date())` in a Playwright global setup reading `apps/web/.env.local`) against the dev server — read-only pages only, never submit forms.
- [ ] **Step 5: Commit** `feat(admin): data tables for clients and history`.

### Task 3: Forms and detail pages (New client, Client detail, Settings)

**Files:**
- Modify: `apps/web/app/bkpadmin/(panel)/clients/new/page.tsx` — PageHeader with back link; two cards "Business details" (Name*, Contact person, Phone, Notes) and "Membership" (Membership ends on (date), PC limit (number with − / + stepper buttons, 1–100), Test client switch with hint "Test clients can be deleted"); two-column grid ≥ 900px; sticky bottom action bar with "Cancel" (secondary, back to list) and "Create client" (primary, pending state). Same field names/action.
- Modify: `apps/web/app/bkpadmin/(panel)/clients/[id]/page.tsx`, `CodeGenerator.tsx`, `DevicesCard.tsx`, `CopyButton.tsx` — header: client name, StatusBadge, "Expires 12 Nov 2026 · 6 days left", Test badge; layout grid: left column cards Details (edit form), Membership (date input + quick extend buttons +1 month / +3 months / +1 year as a button group, PC limit stepper), Sign-in (username + `PasswordInput` + "Save login"; "Generate 6-digit code" → large monospace digits with spaced groups `123 456`, expiry line, WhatsApp text preview in a soft panel, Copy button with "Copied" feedback); right column cards PCs (DataTable: Machine, Windows, App version, Mode badge, Last seen, Remove (danger ghost with confirm)), Recent activity (compact list), Danger zone (Block/Unblock, Delete test client with confirm). Notices for `?ok`/`?error` via `Notice`.
- Modify: `apps/web/app/bkpadmin/(panel)/settings/page.tsx` — card "Renewal contact" (Textarea with 500-char counter, hint "Shown to clients when membership expires"), Save button; card "About" (app version from root package.json if available, environment URL).
- Modify: `apps/web/app/bkpadmin/(panel)/format.ts` only if new display helpers are needed (keep existing exports).

- [ ] **Step 1: Failing Playwright tests** (minted session; read-only): New client page renders both cards and all labelled fields with the original `name` attributes (`name`, `contactPerson`, `phone`, `notes`, `expiresOn`, `pcLimit`, `isTest` — verify against current `actions.ts` and keep exactly); PC limit stepper buttons change the number within 1–100; Settings textarea shows a counter. Screenshots new-client + settings light/dark.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4:** PASS; typecheck, lint, web vitest (all 101+ still pass), web build clean.
- [ ] **Step 5: Commit** `feat(admin): Graphite forms and client detail`.
