/**
 * E2E tests — Meetings page (shell-only)
 *
 * UI-only checks that don't depend on the meetings list loading.
 */
import { test, expect } from "@playwright/test";

const ADMIN_USER = "admin.coastal";
const ADMIN_PASS = "Demo@pass1!";

async function loginAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 20000 });
  await page.getByPlaceholder("Enter your username").fill(ADMIN_USER);
  await page.getByPlaceholder("Enter your password").fill(ADMIN_PASS);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin\/users/, { timeout: 15000 });
  await expect(page.getByRole("link", { name: "Meetings" })).toBeVisible({ timeout: 10000 });
}

test.describe("Meetings — list page shell", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Meetings" }).click();
    await page.waitForURL(/\/meetings/, { timeout: 10000 });
    await expect(page.getByRole("heading", { name: /Meetings/ })).toBeVisible({ timeout: 10000 });
  });

  test("page heading renders", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Meetings/ })).toBeVisible();
  });

  test("New Meeting button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /New Meeting/ }).first()).toBeVisible();
  });

  test("status filter select has all expected options", async ({ page }) => {
    const select = page.getByRole("combobox").first();
    await expect(select).toBeVisible();
    const options = await select.locator("option").allTextContents();
    expect(options).toContain("All Statuses");
    expect(options).toContain("Draft");
    expect(options).toContain("Scheduled");
    expect(options).toContain("In Progress");
    expect(options).toContain("Completed");
    expect(options).toContain("Cancelled");
  });

  test("clicking New Meeting opens the create modal", async ({ page }) => {
    await page.getByRole("button", { name: /New Meeting/ }).first().click();
    // Modal container doesn't expose role="dialog"; check the form fields it renders
    await expect(page.getByPlaceholder("Meeting title")).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: /Create Meeting/ })).toBeVisible();
  });
});
