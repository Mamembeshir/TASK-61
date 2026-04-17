/**
 * E2E navigation tests — verify every major section is reachable
 * from the sidebar after login.
 *
 * IMPORTANT: We use sidebar link clicks (React Router client-side navigation)
 * instead of page.goto() after login.  page.goto() triggers a full page
 * reload; Chromium creates a new document and the auth token stored in
 * sessionStorage is not reliably available for the immediate me() call,
 * causing RequireAuth to redirect to /login.  Sidebar clicks are pure
 * pushState navigations — no page reload, sessionStorage stays intact.
 */
import { test, expect } from "@playwright/test";

const STAFF_USER = "alice.staff";
const STAFF_PASS = "Demo@pass1!";
const ADMIN_USER = "admin.coastal";
const ADMIN_PASS = "Demo@pass1!";

async function loginAs(
  page: import("@playwright/test").Page,
  username: string,
  password: string,
) {
  await page.goto("/login");
  await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 20000 });
  await page.getByPlaceholder("Enter your username").fill(username);
  await page.getByPlaceholder("Enter your password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(dashboard|admin\/users|courier)/, { timeout: 15000 });
}

// ---------------------------------------------------------------------------
// Staff navigation — sidebar link clicks keep sessionStorage intact
// ---------------------------------------------------------------------------
test.describe("Staff navigation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, STAFF_USER, STAFF_PASS);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
    // Confirm the sidebar has rendered before the tests use it
    await expect(page.getByRole("link", { name: "Meetings" })).toBeVisible({ timeout: 10000 });
  });

  test("dashboard renders stat cards and activity heading", async ({ page }) => {
    await expect(page.locator("text=Open Tasks")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("h1")).toBeVisible();
    const heading = await page.locator("h1").textContent();
    expect(heading).toMatch(/Good (morning|afternoon|evening)/);
  });

  test("meetings page is reachable via sidebar", async ({ page }) => {
    await page.getByRole("link", { name: "Meetings" }).click();
    await page.waitForURL(/\/meetings/, { timeout: 10000 });
    await expect(page.getByRole("heading", { name: /Meetings/ })).toBeVisible({ timeout: 10000 });
  });

  test("assets page is reachable via sidebar", async ({ page }) => {
    await page.getByRole("link", { name: "Assets" }).click();
    await page.waitForURL(/\/assets/, { timeout: 10000 });
    await expect(page.getByRole("heading", { name: /Asset/ })).toBeVisible({ timeout: 10000 });
  });

  test("kitchen menus page is reachable via sidebar", async ({ page }) => {
    // Kitchen group is open by default; Menus is a visible sub-item
    await page.getByRole("link", { name: "Menus" }).click();
    await page.waitForURL(/\/kitchen\/menus/, { timeout: 10000 });
    await expect(page.getByRole("heading", { name: /Menus/ })).toBeVisible({ timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// Admin navigation
// ---------------------------------------------------------------------------
test.describe("Admin navigation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN_USER, ADMIN_PASS);
    await expect(page).toHaveURL(/\/admin\/users/, { timeout: 15000 });
    // Use a specific heading selector to avoid strict-mode violations
    await expect(
      page.getByRole("heading", { name: /User Management/i }),
    ).toBeVisible({ timeout: 10000 });
  });

  test("admin users page shows User Management heading", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /User Management/i }),
    ).toBeVisible();
  });

  test("admin can navigate to Tenants via sidebar", async ({ page }) => {
    // Tenants link is only shown for superusers — skip if not present
    const tenantsLink = page.getByRole("link", { name: "Tenants" });
    if (!(await tenantsLink.isVisible())) {
      test.skip();
      return;
    }
    await tenantsLink.click();
    await page.waitForURL(/\/admin\/tenants/, { timeout: 10000 });
    await expect(
      page.getByRole("heading", { name: /Tenants/i }),
    ).toBeVisible({ timeout: 10000 });
  });
});
