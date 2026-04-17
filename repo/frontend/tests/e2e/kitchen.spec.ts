/**
 * E2E tests — Kitchen feature (shell-only)
 *
 * UI-only checks that don't depend on menus/recipes lists loading.
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

test.describe("Menus page shell", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Menus" }).click();
    await page.waitForURL(/\/kitchen\/menus/, { timeout: 10000 });
    await expect(page.getByRole("heading", { name: /Menus/ })).toBeVisible({ timeout: 10000 });
  });

  test("page heading renders", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Menus/ })).toBeVisible();
  });

  test("New Menu button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /New Menu/ }).first()).toBeVisible();
  });
});

test.describe("Recipes page shell", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Recipes" }).click();
    await page.waitForURL(/\/kitchen\/recipes/, { timeout: 10000 });
    await expect(page.getByRole("heading", { name: /Recipes/ })).toBeVisible({ timeout: 10000 });
  });

  test("page heading renders", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Recipes/ })).toBeVisible();
  });

  test("New Recipe button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /New Recipe/ }).first()).toBeVisible();
  });

  test("search input is present and accepts text", async ({ page }) => {
    const search = page.getByPlaceholder(/search/i);
    await expect(search).toBeVisible();
    await search.fill("chicken");
    await expect(search).toHaveValue("chicken");
  });
});
