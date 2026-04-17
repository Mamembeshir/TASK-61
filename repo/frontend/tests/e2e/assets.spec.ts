/**
 * E2E tests — Asset Ledger (shell-only)
 *
 * UI-only checks that don't depend on the asset list loading.
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
  await expect(page.getByRole("link", { name: "Assets" })).toBeVisible({ timeout: 10000 });
}

test.describe("Asset Ledger — page shell", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Assets" }).click();
    await page.waitForURL(/\/assets/, { timeout: 10000 });
    await expect(
      page.getByRole("heading", { name: /Asset Ledger/i }),
    ).toBeVisible({ timeout: 10000 });
  });

  test("page heading shows Asset Ledger", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /Asset Ledger/i }),
    ).toBeVisible();
  });

  test("New Asset, Export and Import buttons are visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /New Asset/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Export/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Import/i }).first()).toBeVisible();
  });

  test("search input is present and accepts text", async ({ page }) => {
    const search = page.getByPlaceholder(/code|name|search/i).first();
    await expect(search).toBeVisible();
    await search.fill("pump");
    await expect(search).toHaveValue("pump");
  });
});
