# Run Bakvion on your Mac

Prepared: 9 November 2026. These are startup instructions for the existing development milestone. The previous validation host was Linux; macOS acceptance is pending.

## 1. Extract and open the project

Download `Bakvion-Mac-Handoff.zip` and extract it. It contains a `bakvion` folder. Move that folder to a location such as `~/Projects/bakvion` without replacing an existing project.

In the Codex Mac app, add/open that extracted folder as a project. The exact project-picker label may differ by app version. Start a new chat and paste the continuation prompt in `HANDOFF.md`. The original chat does not have to appear for the project files and prompt to work.

The ZIP contains source, lockfiles and documentation. It excludes dependencies, caches, secrets, local databases, executables and Git history. Do not clone the original GitHub repository alone and expect to receive the unpushed milestone.

## 2. Install Node.js 24

Install the official Node.js 24 package for your Mac from https://nodejs.org/en/download, or use your existing Node version manager. Choose Apple Silicon for M-series Macs or Intel for an Intel Mac. Open a new Terminal and check:

```sh
node --version
npm --version
```

Node should report `v24.x`. No Windows, Go, Rust, Supabase or cloud credentials are needed just to start the web setup screen.

## 3. Start the web dashboard

Open Terminal in the extracted `bakvion` folder. For example, if you moved it as suggested:

```sh
cd ~/Projects/bakvion
```

Run this single command:

```sh
npx --yes pnpm@11.25.0 install --frozen-lockfile && npx --yes pnpm@11.25.0 dev:web
```

The first startup downloads project dependencies and the pinned pnpm version. It does not require a global pnpm installation. Leave Terminal open and open:

**http://localhost:3000**

Expected result without cloud settings: a branded sign-in/setup page explaining that Supabase configuration is required. This is an intentional state, not a failed backup connection. The web app cannot scan your Mac's folders or control a Windows service in this milestone. Agent enrollment/synchronization is not implemented.

For later starts, from the same folder:

```sh
npx --yes pnpm@11.25.0 dev:web
```

Stop the server with **Control-C**. That stops this local development web server only.

## 4. Optional: preview the desktop interface in your browser

In a second Terminal in the same project folder, after dependencies are installed:

```sh
npx --yes pnpm@11.25.0 dev:desktop
```

Open **http://localhost:1420**.

Expected result: the desktop shell and a service-disconnected message. Theme/navigation work; backup-plan creation is disabled without the Windows runtime/service. It is not the populated AI design concept and does not contain fake backup data. The native Windows service cannot run on macOS.

Do not use `tauri dev` expecting working Mac backup control: the current native pipe bridge is Windows-only. Building the actual Windows desktop and service requires Windows prerequisites and the procedures in `docs/operations/WINDOWS.md`; their native acceptance remains pending.

## 5. Optional: enable real Supabase sign-in

Skip this section if you only want to start the local app.

1. Create or choose an appropriate **development** Supabase project.
2. Review and apply `supabase/migrations/202611070001_foundation.sql` through the normal Supabase migration flow. Do not apply it blindly to an unrelated production database.
3. Configure Supabase Auth site URL and allowed redirect URL as `http://localhost:3000`.
4. Create `apps/web/.env.local` with your project's public values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
```

5. Restart the web server and sign in through the emailed link. Check provider email/rate limits if the message does not arrive.

Only use the public/anon client key here. Never put a service-role key, database password, repository password or OAuth refresh token in public environment variables or chat. `.env.local` is ignored by Git.

An empty dashboard is expected after sign-in: agent enrollment and metadata synchronization are unfinished. See `docs/operations/DEPLOYMENT.md` for hosting details. Vercel deployment is a separate step and has not been performed.

## 6. Validate the source on the Mac

After installation, run from the project root:

```sh
npx --yes pnpm@11.25.0 typecheck
npx --yes pnpm@11.25.0 lint
npx --yes pnpm@11.25.0 test
npx --yes pnpm@11.25.0 test:database
npx --yes pnpm@11.25.0 build
```

Browser checks:

```sh
npx --yes pnpm@11.25.0 exec playwright install chromium
npx --yes pnpm@11.25.0 test:e2e
```

Playwright starts/reuses the desktop development server on port 1420. These tests cover browser disconnected states; they are not Windows desktop or macOS backup acceptance. Historical results in `docs/PROGRESS.md` must not be presented as newly executed Mac results.

The real backup CLI is Go-based. For an optional engine evaluation, install Go and a trusted platform-appropriate restic binary, then follow `README.md` and use only disposable test folders. The supplied restic download helper currently supports Windows/Linux x64, not macOS. Linux builds and Windows `.exe` files cannot be run directly on a Mac. Mac Go/restic compatibility must be validated separately; no Mac backup product is claimed.

## Troubleshooting

- **`node` / `npm` not found:** complete Node installation and reopen Terminal.
- **Wrong folder / package.json missing:** open the folder containing the root `package.json`, `pnpm-workspace.yaml`, `apps` and `services`.
- **pnpm command missing:** use the `npx --yes pnpm@11.25.0 ...` commands above; no global installation is required.
- **Dependencies cannot download:** check internet/proxy/registry access; keep TLS verification enabled and preserve the lockfile.
- **Port 3000 occupied:** stop your own earlier Bakvion process or use `npx --yes pnpm@11.25.0 --filter @bakvion/web dev --port 3001`, then use the URL printed by Next.js. Update Supabase development redirects if using a different port.
- **Port 1420 occupied:** reuse your own running preview or stop it before starting another; Vite uses a strict port.
- **Agent disconnected:** expected in browser/macOS preview. Windows service enrollment and hosted syncing still need implementation/validation.
- **AI image looks more complete:** it contains illustrative data and planned features. Use the source/readiness report as the implementation truth.
- **GitHub still shows only the README:** the code was never pushed successfully. Open this ZIP's folder. Configure authorized GitHub access before publishing a separate feature branch; do not force-push or overwrite unrelated repositories.
