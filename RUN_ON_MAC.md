# Run Bakvion on a Mac

The Mac runs the website, the admin panel, the app's screens in a browser, and all tests including real restic backups. The background service and the installer are Windows-only.

## 1. One-time setup

- Node 24 (Homebrew: `brew install node@24`). Your default `node` may be another version, so put Node 24 first in each terminal:

  ```sh
  export PATH=/opt/homebrew/opt/node@24/bin:$PATH
  ```

- Install dependencies from the project folder:

  ```sh
  npx --yes pnpm@11.25.0 install --frozen-lockfile
  ```

- Website and admin need `apps/web/.env.local`. Copy `apps/web/.env.example` and fill in the values (Supabase URL and secret key, admin username/password, session secret, licence signing key, cron secret, SMTP). The file is ignored by git; never commit or share it.

## 2. Start the frontends

Website and admin panel:

```sh
npx --yes pnpm@11.25.0 dev:web
```

- Website: <http://localhost:3000> (Hindi: `/hi`, Gujarati: `/gu`)
- Admin: <http://localhost:3000/bkpadmin>

App screens (in a browser):

```sh
npx --yes pnpm@11.25.0 dev:desktop
```

- <http://localhost:1420>. It shows "service not connected": that is expected on a Mac, because the background service only runs on Windows. Every screen is still visible.

Stop either server with **Control-C**.

## 3. Run the checks

```sh
npx --yes pnpm@11.25.0 typecheck
npx --yes pnpm@11.25.0 lint
npx --yes pnpm@11.25.0 format:check
npx --yes pnpm@11.25.0 test
npx --yes pnpm@11.25.0 test:database
npx --yes pnpm@11.25.0 exec playwright install chromium   # once
npx --yes pnpm@11.25.0 test:e2e
```

Real backup tests need Go and restic (`brew install go restic`):

```sh
mkdir -p ~/.cache/bakvion-tmp
TMPDIR=$HOME/.cache/bakvion-tmp BAKVION_TEST_RESTIC=$(which restic) go -C services/agent test ./...
GOOS=windows go -C services/agent vet ./...
```

## Troubleshooting

- **`pnpm` not found:** use the `npx --yes pnpm@11.25.0 …` form shown above.
- **Wrong Node version errors:** run the `export PATH=…node@24…` line in that terminal.
- **Port 3000 or 1420 busy:** stop the earlier server with Control-C.
- **Admin page errors:** check `apps/web/.env.local` and that the Supabase migrations in `supabase/migrations` were applied.
