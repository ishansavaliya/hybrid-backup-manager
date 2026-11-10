import { defineConfig } from "@playwright/test";

const WEB_SPECS = /admin-.*\.spec\.ts$/;

export default defineConfig({
  testDir: "./tests/e2e",
  use: { headless: true },
  projects: [
    {
      name: "desktop",
      testIgnore: WEB_SPECS,
      use: { baseURL: "http://127.0.0.1:1420" },
    },
    {
      name: "web",
      testMatch: WEB_SPECS,
      // localhost, not 127.0.0.1: Next 16 dev blocks its client scripts for
      // other origins unless next.config lists them in allowedDevOrigins.
      use: { baseURL: "http://localhost:3000" },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @bakvion/desktop dev",
      url: "http://127.0.0.1:1420",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npx --yes pnpm@11.25.0 --filter @bakvion/web dev",
      url: "http://localhost:3000/bkpadmin/login",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
  reporter: "list",
});
