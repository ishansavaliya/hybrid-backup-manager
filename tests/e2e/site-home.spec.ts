import { test, expect } from "@playwright/test";

test("home page explains Bakvion and offers download", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Always protected.",
  );
  await expect(
    page.getByRole("heading", { name: "Ready in about 2 minutes" }),
  ).toBeVisible();
  // No installer published yet → disabled "coming soon" button.
  await expect(page.getByText("Download coming soon").first()).toBeVisible();
  await expect(page.getByText("Sign in with the code")).toHaveCount(0);
});

test("language switch shows Hindi and Gujarati pages", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "ગુ" }).click();
  await expect(page).toHaveURL(/\/gu$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "હંમેશા સુરક્ષિત",
  );
  await page.getByRole("link", { name: "हि" }).click();
  await expect(page).toHaveURL(/\/hi$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "हमेशा सुरक्षित",
  );
});

test("expert form sends an enquiry and thanks the visitor", async ({
  page,
}) => {
  let body: Record<string, unknown> | null = null;
  await page.route("**/api/v1/leads", async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({ status: 200, json: { ok: true } });
  });
  await page.goto("/#expert");
  await page.getByLabel("Your name").fill("Asha Mehta");
  await page.getByLabel("Business name").fill("Mehta Traders");
  await page.getByLabel("Phone (WhatsApp)").fill("+91 98765 43210");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(
    page.getByText("A Bakvion expert will contact you within 24 hours."),
  ).toBeVisible();
  expect(body).toMatchObject({
    name: "Asha Mehta",
    business: "Mehta Traders",
    source: "website",
    website: "",
  });
});

test("expert form shows server validation errors", async ({ page }) => {
  await page.route("**/api/v1/leads", (route) =>
    route.fulfill({
      status: 400,
      json: {
        error: { code: "bad_request", message: "x" },
        fields: { phone: "bad" },
      },
    }),
  );
  await page.goto("/#expert");
  await page.getByLabel("Your name").fill("Asha");
  await page.getByLabel("Business name").fill("Mehta Traders");
  await page.getByLabel("Phone (WhatsApp)").fill("1234567890");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Please check" }),
  ).toHaveText("Please check the highlighted fields.");
  await expect(page.getByLabel("Phone (WhatsApp)")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
});
