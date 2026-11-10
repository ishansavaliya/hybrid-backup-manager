import { test, expect, type Page } from "@playwright/test";

type Json = Record<string, unknown>;
const base: Json = {
  signedIn: true,
  mode: "full",
  reason: "",
  clientName: "Acme Traders",
  expiresAt: "2027-01-31T23:59:59+05:30",
  daysLeft: 80,
  showBadge: false,
  renewContact: "",
  lastSyncAt: new Date().toISOString(),
  daysSinceSync: 0,
  syncWarning: false,
  installId: "install-1",
  appVersion: "0.1.0",
};
const signedOut: Json = {
  ...base,
  signedIn: false,
  mode: "signed_out",
  reason: "signed_out",
  clientName: "",
  expiresAt: null,
  lastSyncAt: null,
};
const plan = {
  id: "p1",
  name: "Documents",
  sources: ["C:\\Docs"],
  destinations: [],
};

async function mock(
  page: Page,
  opts: {
    status: Json;
    plans?: unknown[];
    signInError?: { code: string; message: string };
    refreshError?: { code: string; message: string };
  },
) {
  await page.addInitScript((o) => {
    const w = window as unknown as {
      __calls: { method: string; params: unknown }[];
      __TAURI_INTERNALS__: unknown;
    };
    w.__calls = [];
    w.__TAURI_INTERNALS__ = {
      transformCallback: () => 0,
      invoke: async (
        _cmd: string,
        args: { request: { method: string; params: unknown } },
      ) => {
        const { method, params } = args.request;
        w.__calls.push({ method, params });
        if (method === "refreshLicense" && o.refreshError)
          return { version: 1, error: o.refreshError };
        if (method === "accountStatus" || method === "refreshLicense")
          return { version: 1, result: o.status };
        if (method === "signIn")
          return o.signInError
            ? { version: 1, error: o.signInError }
            : { version: 1, result: o.status };
        if (method === "signOut") return { version: 1, result: true };
        if (method === "overview")
          return {
            version: 1,
            result: {
              status: { version: "0.1.0", mode: "full", capabilities: [] },
              plans: o.plans ?? [],
              executions: [],
            },
          };
        return { version: 1, result: [] };
      },
    };
  }, opts);
}
const calls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __calls: unknown[] }).__calls);

test("signed out with no plans shows code sign-in", async ({ page }) => {
  await mock(page, { status: signedOut });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Username" })).toBeVisible();
  await page.getByRole("button", { name: "6-digit code" }).click();
  await expect(page.getByLabel(/^Digit \d$/)).toHaveCount(6);
  await expect(
    page.getByText("No account? Contact your Bakvion provider."),
  ).toBeVisible();
  await page.getByLabel("Digit 1").focus();
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData("text", "481920");
    document.activeElement?.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }),
    );
  });
  await expect(page.getByLabel("Digit 6")).toHaveValue("0");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect
    .poll(async () =>
      (await calls(page)).find(
        (c) => (c as { method: string }).method === "signIn",
      ),
    )
    .toEqual({ method: "signIn", params: { method: "code", code: "481920" } });
});

test("password sign-in sends username and password", async ({ page }) => {
  await mock(page, { status: signedOut });
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill("acme");
  const pw = page.getByLabel("Password");
  await expect(pw).toHaveAttribute("type", "password");
  await pw.fill("secret-pass");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect
    .poll(async () =>
      (await calls(page)).find(
        (c) => (c as { method: string }).method === "signIn",
      ),
    )
    .toEqual({
      method: "signIn",
      params: { method: "password", username: "acme", password: "secret-pass" },
    });
});

test("CODE_INVALID shows its message", async ({ page }) => {
  await mock(page, {
    status: signedOut,
    signInError: { code: "CODE_INVALID", message: "raw" },
  });
  await page.goto("/");
  await page.getByRole("button", { name: "6-digit code" }).click();
  for (let i = 1; i <= 6; i++) await page.getByLabel(`Digit ${i}`).fill("1");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "This code is wrong, already used, or expired. Ask your Bakvion provider for a new one.",
  );
});

test("PC_LIMIT shows the server's message", async ({ page }) => {
  await mock(page, {
    status: signedOut,
    signInError: {
      code: "PC_LIMIT",
      message: "Your plan allows 2 PCs. Contact your Bakvion provider.",
    },
  });
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill("acme");
  await page.getByLabel("Password").fill("secret-pass");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Your plan allows 2 PCs. Contact your Bakvion provider.",
  );
});

test("PC_LIMIT without a server message shows the generic text", async ({
  page,
}) => {
  await mock(page, {
    status: signedOut,
    signInError: { code: "PC_LIMIT", message: "pc_limit" },
  });
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill("acme");
  await page.getByLabel("Password").fill("secret-pass");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Your plan's PC limit is reached. Contact your Bakvion provider.",
  );
});

test("clock restore-only explains how to fix the date and time", async ({
  page,
}) => {
  await mock(page, {
    status: { ...base, mode: "restore_only", reason: "clock" },
  });
  await page.goto("/");
  await expect(
    page.getByText(
      "Your PC's date and time look wrong. Correct them in Windows Settings, then click Sync now.",
      { exact: true },
    ),
  ).toBeVisible();
});

test("expiry badge shows days left", async ({ page }) => {
  await mock(page, {
    status: {
      ...base,
      daysLeft: 6,
      showBadge: true,
      renewContact: "help@bakvion.example",
    },
  });
  await page.goto("/");
  const badge = page.getByRole("button", {
    name: "Membership expires in 6 days — please renew",
  });
  await expect(badge).toBeVisible();
  await badge.click();
  await expect(page.getByText("help@bakvion.example")).toBeVisible();
});

test("sync warning indicator", async ({ page }) => {
  await mock(page, {
    status: { ...base, syncWarning: true, daysSinceSync: 4 },
  });
  await page.goto("/");
  await expect(
    page.getByText("Not synced for 4 days — connect to the internet"),
  ).toBeVisible();
});

test("restore-only blocks new backups but Recovery works", async ({ page }) => {
  await mock(page, {
    status: {
      ...base,
      mode: "restore_only",
      reason: "expired",
      renewContact: "help@bakvion.example",
    },
    plans: [plan],
    refreshError: { code: "OFFLINE", message: "raw" },
  });
  await page.goto("/");
  await expect(page.getByText("Your membership has expired.")).toBeVisible();
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "No internet connection. Connect to the internet and try again.",
  );
  await expect(page.getByText("help@bakvion.example").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create backup plan" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Backup plans", exact: true }).click();
  await expect(page.getByRole("button", { name: "Run backup" })).toBeDisabled();
  await page.getByRole("button", { name: "Recovery", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Recovery", exact: true }),
  ).toBeVisible();
});

test("failed sign-in keeps the sign-in screen open with the error", async ({
  page,
}) => {
  await mock(page, {
    status: signedOut,
    plans: [plan],
    signInError: { code: "CODE_INVALID", message: "raw" },
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "6-digit code" }).click();
  for (let i = 1; i <= 6; i++) await page.getByLabel(`Digit ${i}`).fill("1");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "This code is wrong, already used, or expired.",
  );
  await expect(page.getByLabel("Digit 1")).toBeVisible();
});

test("settings shows last sync and Sync now refreshes the licence", async ({
  page,
}) => {
  await mock(page, {
    status: {
      ...base,
      lastSyncAt: "2026-11-06T00:00:00Z",
      daysSinceSync: 4,
    },
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByText("Last synced: 4 days ago")).toBeVisible();
  await expect(page.getByText("Acme Traders")).toBeVisible();
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect
    .poll(async () =>
      (await calls(page)).some(
        (c) => (c as { method: string }).method === "refreshLicense",
      ),
    )
    .toBe(true);
});
