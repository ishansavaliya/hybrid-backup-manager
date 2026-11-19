import { test, expect, type Page } from "@playwright/test";

const status = {
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
const plan = {
  id: "p1",
  name: "Documents",
  sources: ["C:\\Docs"],
  exclusions: [],
  destinations: [
    {
      id: "d1",
      name: "Office SSD",
      repository: "E:\\BakvionRepository",
      passwordFile: "",
    },
  ],
  schedule: { kind: "daily", time: "13:00" },
  retention: { enabled: true, daily: 7, weekly: 4, monthly: 12 },
};

async function mock(
  page: Page,
  o: {
    plans?: unknown[];
    nextRuns?: Record<string, string>;
    kit?: { needed: boolean; savedAt: string | null };
    disks?: unknown[];
    executions?: unknown[];
    drive?: { path: string; mode: string }[];
    appVersion?: string;
    update?: Record<string, unknown>;
    snapshots?: unknown[];
  },
) {
  await page.addInitScript(
    (o) => {
      const w = window as unknown as {
        __calls: { method: string; params: unknown }[];
        __TAURI_INTERNALS__: unknown;
      };
      w.__calls = [];
      w.__TAURI_INTERNALS__ = {
        transformCallback: () => 0,
        invoke: async (
          cmd: string,
          args: { request?: { method: string; params: unknown } },
        ) => {
          if (cmd.startsWith("plugin:dialog")) return "D:\\Safe";
          if (cmd === "plugin:app|version") return o.appVersion ?? "0.2.0";
          const { method, params } = args.request ?? {
            method: cmd,
            params: null,
          };
          w.__calls.push({ method, params });
          if (method === "accountStatus" || method === "refreshLicense")
            return { version: 1, result: o.status };
          if (method === "overview")
            return {
              version: 1,
              result: {
                status: { version: "0.1.0", mode: "full", capabilities: [] },
                plans: o.plans ?? [],
                executions: o.executions ?? [],
                disks: o.disks ?? [],
                nextRuns: o.nextRuns ?? {},
                kit: o.kit ?? { needed: false, savedAt: null },
              },
            };
          if (method === "openExistingBackup")
            return {
              version: 1,
              result: {
                id: "old1",
                name: (params as { name: string }).name,
                sources: [],
                exclusions: [],
                destinations: [
                  {
                    id: "backup",
                    name: (params as { name: string }).name,
                    repository: (params as { repository: string }).repository,
                    passwordFile: "",
                  },
                ],
                schedule: { kind: "manual" },
                retention: { enabled: false, daily: 7, weekly: 4, monthly: 12 },
                restoreOnly: true,
              },
            };
          if (method === "updateStatus" || method === "checkForUpdates")
            return {
              version: 1,
              result:
                method === "checkForUpdates"
                  ? {
                      ...o.update,
                      latest: "0.3.0",
                      available: false,
                      current: "0.3.0",
                      checkedAt: new Date().toISOString(),
                    }
                  : o.update,
            };
          if (method === "snapshots")
            return { version: 1, result: o.snapshots ?? [] };
          if (method === "findGoogleDrive")
            return { version: 1, result: { folders: o.drive ?? [] } };
          if (method === "reportSettings")
            return {
              version: 1,
              result: { emails: ["owner@shop.in"], mode: "failures" },
            };
          if (method === "setReportSettings")
            return { version: 1, result: params };
          if (method === "sendTestReport")
            return { version: 1, result: { sent: true } };
          if (method === "exportRecoveryKit")
            return {
              version: 1,
              result: { path: "D:\\Safe\\Bakvion-Recovery-Kit.txt" },
            };
          return { version: 1, result: { ok: true } };
        },
      };
    },
    { ...o, status },
  );
}
const sent = async (page: Page, method: string) =>
  (
    (await page.evaluate(
      () => (window as unknown as { __calls: unknown[] }).__calls,
    )) as { method: string; params: Record<string, unknown> }[]
  ).find((c) => c.method === method)?.params;

test("wizard saves a weekly schedule with cleanup and a managed key", async ({
  page,
}) => {
  await mock(page, {});
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create backup plan" })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Plan name").fill("Tally data");
  await dialog.getByRole("button", { name: "Add folder" }).click();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog.getByRole("button", { name: "Add destination" }).click();
  await dialog.getByRole("button", { name: "Continue" }).click();

  await expect(
    dialog.getByText("Step 3 of 4 · Schedule & cleanup"),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Selected days" }).click();
  // Mon–Sat preselected; drop Saturday.
  await dialog.getByRole("button", { name: "Sat" }).click();
  await dialog.getByLabel("Time").fill("18:30");
  await dialog.getByText("Delete old versions automatically").click();
  await dialog.getByLabel("Daily versions").fill("10");
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(
    dialog.getByText("Mon, Tue, Wed, Thu, Fri at 18:30"),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Save plan" }).click();

  await expect
    .poll(() => sent(page, "savePlan"))
    .toMatchObject({
      name: "Tally data",
      schedule: { kind: "weekly", time: "18:30", days: [1, 2, 3, 4, 5] },
      retention: { enabled: true, daily: 10, weekly: 4, monthly: 12 },
    });
  const saved = await sent(page, "savePlan");
  expect(
    (saved?.destinations as { passwordFile: string }[])[0].passwordFile,
  ).toBe("");
});

test("weekly schedule needs at least one day", async ({ page }) => {
  await mock(page, {});
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create backup plan" })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Plan name").fill("Docs");
  await dialog.getByRole("button", { name: "Add folder" }).click();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog.getByRole("button", { name: "Add destination" }).click();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog.getByRole("button", { name: "Selected days" }).click();
  for (const d of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"])
    await dialog.getByRole("button", { name: d }).click();
  await expect(dialog.getByRole("button", { name: "Continue" })).toBeDisabled();
});

test("plans show schedule, next run and cleanup; schedule can be edited", async ({
  page,
}) => {
  const next = new Date(Date.now() + 2 * 3600_000).toISOString();
  await mock(page, { plans: [plan], nextRuns: { p1: next } });
  await page.goto("/");
  await expect(page.getByText("Next backup in 2 hours")).toBeVisible();
  await page.getByRole("button", { name: "Backup plans", exact: true }).click();
  await expect(page.getByText("Every day at 13:00")).toBeVisible();
  await expect(
    page.getByText("Cleanup keeps 7 daily · 4 weekly · 12 monthly"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Schedule & cleanup" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Every hour" }).click();
  await dialog.getByText("Delete old versions automatically").click();
  await dialog.getByRole("button", { name: "Save plan" }).click();
  await expect
    .poll(() => sent(page, "savePlan"))
    .toMatchObject({
      id: "p1",
      schedule: { kind: "hourly" },
      retention: { enabled: false },
    });
  const saved = await sent(page, "savePlan");
  expect(saved?.schedule).toEqual({ kind: "hourly" });
});

test("connect existing backup sends the recovery-kit key", async ({ page }) => {
  await mock(page, { plans: [plan] });
  await page.goto("/");
  await page.getByRole("button", { name: "Backup plans", exact: true }).click();
  await page.getByRole("button", { name: "Manage" }).click();
  await page.getByRole("button", { name: "Connect existing" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Connect existing" }),
  ).toBeDisabled();
  await dialog
    .getByLabel("Key from the recovery kit", { exact: true })
    .fill("kit-key-0123456789");
  await dialog.getByRole("button", { name: "Connect existing" }).click();
  await expect
    .poll(() => sent(page, "connectDestination"))
    .toEqual({
      planId: "p1",
      destinationId: "d1",
      key: "kit-key-0123456789",
    });
  await expect(
    page.getByText("Backup connected. You can restore from it now."),
  ).toBeVisible();
});

test("settings asks to save the recovery kit and exports it", async ({
  page,
}) => {
  await mock(page, { plans: [plan], kit: { needed: true, savedAt: null } });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByText("New keys were created. Save your recovery kit now."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save recovery kit" }).click();
  await expect
    .poll(() => sent(page, "exportRecoveryKit"))
    .toEqual({
      directory: "D:\\Safe",
    });
  await expect(
    page.getByText("Recovery kit saved: D:\\Safe\\Bakvion-Recovery-Kit.txt"),
  ).toBeVisible();
});

test("email reports: shows saved settings, saves changes, sends a test", async ({
  page,
}) => {
  await mock(page, { plans: [plan] });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const email1 = page.getByLabel("Email address 1", { exact: true });
  await expect(email1).toHaveValue("owner@shop.in");
  await expect(
    page.getByRole("button", { name: "Only failures" }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Add another email" }).click();
  const email2 = page.getByLabel("Email address 2", { exact: true });
  await email2.fill("not-an-email");
  await expect(page.getByText("Check the email addresses.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await email2.fill("ca@firm.in");
  await page.getByRole("button", { name: "Every backup" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .poll(() => sent(page, "setReportSettings"))
    .toEqual({
      emails: ["owner@shop.in", "ca@firm.in"],
      mode: "all",
    });
  await expect(page.getByText("Email report settings saved.")).toBeVisible();

  await page.getByRole("button", { name: "Send test email" }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { __calls: { method: string }[] }).__calls.some(
          (c) => c.method === "sendTestReport",
        ),
      ),
    )
    .toBe(true);
  await expect(
    page.getByText("Test email sent to owner@shop.in, ca@firm.in."),
  ).toBeVisible();
});

test("almost-full disk shows a banner and a badge", async ({ page }) => {
  await mock(page, {
    plans: [plan],
    disks: [
      {
        planId: "p1",
        destinationId: "d1",
        usedPercent: 93,
        freeBytes: 4_200_000_000,
        totalBytes: 60_000_000_000,
        checkedAt: new Date().toISOString(),
      },
    ],
  });
  await page.goto("/");
  await expect(
    page.getByText(
      "Office SSD is 93% full (4.2 GB free). Free up space or turn on “Delete old versions automatically”.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Backup plans", exact: true }).click();
  await expect(page.getByText("93% full", { exact: true })).toBeVisible();
});

async function openDestinationStep(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create backup plan" })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Plan name").fill("Docs");
  await dialog.getByRole("button", { name: "Add folder" }).click();
  await dialog.getByRole("button", { name: "Continue" }).click();
  return dialog;
}

test("Google Drive mirror folder is added as a destination", async ({
  page,
}) => {
  await mock(page, {
    drive: [
      { path: "G:\\My Drive", mode: "stream" },
      { path: "C:\\Users\\Asha\\My Drive", mode: "mirror" },
    ],
  });
  const dialog = await openDestinationStep(page);
  await dialog.getByRole("button", { name: "Google Drive" }).click();
  await expect(dialog.getByLabel("Destination name")).toHaveValue(
    "Google Drive",
  );
  await expect(
    dialog.getByText("C:\\Users\\Asha\\My Drive\\BakvionRepository"),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Continue" })).toBeEnabled();
});

test("Google Drive in stream mode shows the setup guide", async ({ page }) => {
  await mock(page, { drive: [{ path: "G:\\My Drive", mode: "stream" }] });
  const dialog = await openDestinationStep(page);
  await dialog.getByRole("button", { name: "Google Drive" }).click();
  await expect(
    dialog.getByText("Google Drive is set to “Stream files”.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Choose “Mirror files” and click Save.", { exact: false }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Check again" }),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Continue" })).toBeDisabled();
  // Choosing the mirror folder by hand also works.
  await dialog
    .getByRole("button", { name: "Choose the folder myself" })
    .click();
  await expect(dialog.getByLabel("Destination name")).toHaveValue(
    "Google Drive",
  );
});

test("history shows run notes in plain words", async ({ page }) => {
  await mock(page, {
    plans: [plan],
    executions: [
      {
        id: "e1",
        planId: "p1",
        destinationId: "d1",
        state: "succeeded",
        snapshotId: "abcdef1234567890",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        error: "",
        notes:
          "Backup disk found at F:\\ (was E:\\)\nSome files could not be read and were skipped\nBackup disk is 95% full (1.0 GB free)",
      },
    ],
  });
  await page.goto("/");
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(
    page.getByText("Disk found at F:\\ (was E:\\)", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Some files could not be read", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Disk 95% full (1.0 GB free)", { exact: false }),
  ).toBeVisible();
});

test("a new PC opens a backup from another PC with the kit key", async ({
  page,
}) => {
  await mock(page, {});
  await page.goto("/");
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await page
    .getByRole("button", { name: "Open a backup from another PC" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Name")).toHaveValue("Old PC backup");
  await expect(
    dialog.getByRole("button", { name: "Open backup" }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Choose folder" }).click();
  await expect(dialog.getByText("D:\\Safe")).toBeVisible();
  await dialog
    .getByLabel("Key from the recovery kit", { exact: true })
    .fill("kit-key-0123456789");
  await dialog.getByRole("button", { name: "Open backup" }).click();
  await expect
    .poll(() => sent(page, "openExistingBackup"))
    .toEqual({
      name: "Old PC backup",
      repository: "D:\\Safe",
      key: "kit-key-0123456789",
    });
  await expect(
    page.getByText("Backup opened. Choose it above to restore files."),
  ).toBeVisible();
});

test("restore-only plans cannot be backed up or edited", async ({ page }) => {
  await mock(page, {
    plans: [
      plan,
      {
        ...plan,
        id: "old1",
        name: "Old PC backup",
        sources: [],
        restoreOnly: true,
        destinations: [{ ...plan.destinations[0], id: "backup" }],
      },
    ],
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Backup plans", exact: true }).click();
  const old = page.locator(".gx-plan").filter({ hasText: "Old PC backup" });
  await expect(old.getByText("Restore only", { exact: true })).toBeVisible();
  await expect(
    old.getByText("Opened from another PC.", { exact: false }),
  ).toBeVisible();
  await expect(old.getByRole("button", { name: "Run backup" })).toHaveCount(0);
  await expect(
    old.getByRole("button", { name: "Schedule & cleanup" }),
  ).toHaveCount(0);
  await old.getByRole("button", { name: "Manage" }).click();
  const tools = page.getByRole("dialog");
  await expect(tools.getByRole("button", { name: "Set up" })).toHaveCount(0);
  await expect(tools.getByRole("button", { name: "Verify" })).toBeVisible();
  await tools.getByRole("button", { name: "Close" }).first().click();
  // Overview counts only this PC's own plan.
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.locator(".gx-tile").first()).toContainText("1");
});

const updateBase = {
  current: "0.2.0",
  latest: "0.3.0",
  available: true,
  checkedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
  installing: "",
  error: "",
  automatic: true,
};

test("settings shows versions and checks for updates", async ({ page }) => {
  await mock(page, { plans: [plan], update: updateBase });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const card = page.locator(".gx-card").filter({ hasText: "About & updates" });
  await expect(card.getByText("App version")).toBeVisible();
  await expect(card.locator("dd").nth(0)).toHaveText("0.2.0");
  await expect(card.locator("dd").nth(1)).toHaveText("0.2.0");
  await expect(card.locator("dd").nth(2)).toHaveText("0.3.0");
  await expect(card.getByText("2 hours ago")).toBeVisible();
  await expect(
    card.getByText(
      "Version 0.3.0 is available. It installs automatically when no backup is running.",
    ),
  ).toBeVisible();
  await card.getByRole("button", { name: "Check for updates" }).click();
  await expect(card.getByText("Bakvion is up to date.")).toBeVisible();
});

test("settings warns when app and service versions differ", async ({
  page,
}) => {
  await mock(page, {
    plans: [plan],
    appVersion: "0.3.0",
    update: { ...updateBase, available: false, latest: "0.3.0" },
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByText(
      "The app and the background service have different versions. Restart the PC to finish the update.",
    ),
  ).toBeVisible();
});

test("offline update check is explained", async ({ page }) => {
  await mock(page, {
    plans: [plan],
    update: {
      ...updateBase,
      available: false,
      latest: "",
      error:
        "No internet connection. Updates will be checked when this PC is online.",
    },
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByText(
      "No internet connection. Updates will be checked when this PC is online.",
    ),
  ).toBeVisible();
});

test("deleting a plan asks first and keeps backups", async ({ page }) => {
  await mock(page, { plans: [plan], kit: { needed: true, savedAt: null } });
  await page.goto("/");
  await page.getByRole("button", { name: "Backup plans", exact: true }).click();
  await page.getByRole("button", { name: "Delete plan: Documents" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Delete “Documents”?" }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Backups already saved stay on the disk", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Save your recovery kit first", { exact: false }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Delete plan" }).click();
  await expect.poll(() => sent(page, "deletePlan")).toEqual({ planId: "p1" });
  await expect(
    page.getByText("Plan deleted. Its backups are still on the disk."),
  ).toBeVisible();
});

test.describe("restore date picker", () => {
  test.use({ timezoneId: "Asia/Kolkata" });

  test("only days with backups can be picked, in local time", async ({
    page,
  }) => {
    await mock(page, {
      plans: [plan],
      snapshots: [
        // 2:00 AM IST on 10 Nov is still 9 Nov in UTC.
        {
          id: "aaaa1111bbbb2222",
          time: "2026-11-09T20:30:00Z",
          paths: [],
          hostname: "PC",
        },
        {
          id: "cccc3333dddd4444",
          time: "2026-11-12T06:00:00Z",
          paths: [],
          hostname: "PC",
        },
      ],
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Restore", exact: true }).click();
    const picker = page.locator("#rs-day");
    await expect(picker).toBeDisabled();
    await page.getByRole("combobox", { name: "Backup plan" }).click();
    await page.getByRole("option", { name: "Documents" }).click();
    await page.getByRole("combobox", { name: "Destination" }).click();
    await page.getByRole("option", { name: "Office SSD" }).click();
    await page.getByRole("button", { name: "Find backups" }).click();
    await expect(page.getByText("aaaa1111bbbb")).toBeVisible();
    await expect(page.getByText("cccc3333dddd")).toBeVisible();

    await picker.click();
    const cal = page.getByRole("dialog", { name: "Choose a date" });
    await expect(cal.getByText("November 2026")).toBeVisible();
    await expect(
      cal.getByRole("button", { name: /(^|\s)9 November/ }),
    ).toBeDisabled();
    await expect(
      cal.getByRole("button", { name: /(^|\s)11 November/ }),
    ).toBeDisabled();
    await cal.getByRole("button", { name: /(^|\s)10 November/ }).click();
    await expect(cal).toBeHidden();
    await expect(page.getByText("aaaa1111bbbb")).toBeVisible();
    await expect(page.getByText("cccc3333dddd")).toHaveCount(0);

    await page.getByRole("button", { name: "Clear date" }).click();
    await expect(page.getByText("cccc3333dddd")).toBeVisible();

    // Keyboard: Escape closes.
    await picker.click();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Choose a date" }),
    ).toBeHidden();
  });
});
