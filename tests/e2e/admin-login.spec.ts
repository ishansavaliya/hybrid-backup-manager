import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

// Runs in the "web" Playwright project against the Next.js dev server.
// Only renders /bkpadmin/login; the form is never submitted (that would hit
// the real database rate limiter).

const LOGIN = "/bkpadmin/login";
const SHOTS_DIR = process.env.ADMIN_SHOTS_DIR;

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS_DIR) return;
  // Hide the Next.js dev-tools badge so the shot shows only the page.
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
  await page.screenshot({ path: path.join(SHOTS_DIR, name), fullPage: true });
}

test.use({ viewport: { width: 1440, height: 900 } });

test.describe("admin login (light OS)", () => {
  test.use({ colorScheme: "light" });

  test("shows the Graphite sign-in card", async ({ page }) => {
    await page.goto(LOGIN);
    await expect(
      page.getByRole("heading", { name: "Admin sign in" }),
    ).toBeVisible();
    await expect(page.getByText("Bakvion owner panel")).toBeVisible();
    await expect(page.getByLabel("Username")).toHaveAttribute(
      "name",
      "username",
    );
    await expect(page.getByRole("button", { name: "Sign in" })).toHaveAttribute(
      "type",
      "submit",
    );
    await expect(page.locator(".gx")).toHaveAttribute("data-theme", "light");
    await shot(page, "login-light.png");
  });

  test("password eye toggle switches the input type", async ({ page }) => {
    await page.goto(LOGIN);
    const password = page.getByLabel("Password", { exact: true });
    await expect(password).toHaveAttribute("type", "password");
    await expect(password).toHaveAttribute("name", "password");

    const show = page.getByRole("button", { name: "Show password" });
    await expect(show).toHaveAttribute("type", "button");
    await password.fill("secret-value");
    await show.click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(password).toHaveValue("secret-value");

    const hide = page.getByRole("button", { name: "Hide password" });
    await expect(hide).toHaveAttribute("type", "button");
    await hide.click();
    await expect(password).toHaveAttribute("type", "password");
    await expect(
      page.getByRole("button", { name: "Show password" }),
    ).toBeVisible();
    // Toggling never submits the form.
    await expect(page).toHaveURL(new RegExp(`${LOGIN}$`));
  });

  test("theme toggle switches and persists after reload", async ({ page }) => {
    await page.goto(LOGIN);
    const root = page.locator(".gx");
    await expect(root).toHaveAttribute("data-theme", "light");

    const toggle = page.getByRole("switch", { name: "Dark theme" });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await expect(root).toHaveAttribute("data-theme", "dark");
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(
      await page.evaluate(() => localStorage.getItem("bkp-admin-theme")),
    ).toBe("dark");

    await page.reload();
    await expect(root).toHaveAttribute("data-theme", "dark");
    await expect(
      page.getByRole("switch", { name: "Dark theme" }),
    ).toHaveAttribute("aria-checked", "true");

    await page.getByRole("switch", { name: "Dark theme" }).click();
    await expect(root).toHaveAttribute("data-theme", "light");
    await page.reload();
    await expect(root).toHaveAttribute("data-theme", "light");
  });
});

test.describe("admin login (dark OS)", () => {
  test.use({ colorScheme: "dark" });

  test("follows the OS dark preference on first visit", async ({ page }) => {
    await page.goto(LOGIN);
    await expect(page.locator(".gx")).toHaveAttribute("data-theme", "dark");
    await expect(
      page.getByRole("heading", { name: "Admin sign in" }),
    ).toBeVisible();
    await expect(
      page.getByRole("switch", { name: "Dark theme" }),
    ).toHaveAttribute("aria-checked", "true");
    await shot(page, "login-dark.png");
  });

  test("theme is set before first paint", async ({ page }) => {
    // The inline script must run while the HTML is parsed, before hydration.
    await page.goto(LOGIN, { waitUntil: "domcontentloaded" });
    const themeAtParse = await page.evaluate(
      () => document.querySelector(".gx")?.getAttribute("data-theme") ?? "none",
    );
    expect(themeAtParse).toBe("dark");

    // And the server HTML carries the theme script ahead of the content.
    const html = await (await page.request.get(LOGIN)).text();
    const scriptAt = html.indexOf("bkp-admin-theme");
    expect(scriptAt).toBeGreaterThan(-1);
    expect(scriptAt).toBeLessThan(html.indexOf("Admin sign in"));
  });
});
