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
                executions: [],
                nextRuns: o.nextRuns ?? {},
                kit: o.kit ?? { needed: false, savedAt: null },
              },
            };
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
