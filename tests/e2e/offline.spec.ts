import { test, expect } from "@playwright/test";
test("browser does not fabricate agent connectivity or backup results", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your protection, at a glance" }),
  ).toBeVisible();
  await expect(
    page.getByText("Connect your local backup service"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create backup plan" }),
  ).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText(
    "Windows desktop runtime required",
  );
  await page.getByRole("button", { name: "Reconnect", exact: true }).click();
  await expect(page.getByText("Service not running")).toBeVisible();
});
test("theme toggle and navigation remain keyboard accessible offline", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.locator(".gx")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Use light theme" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Restore", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Connect your local backup service"),
  ).toBeVisible();
});
