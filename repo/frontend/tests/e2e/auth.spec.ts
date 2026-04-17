import { test, expect } from "@playwright/test";

const ADMIN_USER    = "admin.coastal";
const ADMIN_PASS    = "Demo@pass1!";
const STAFF_USER    = "alice.staff";
const STAFF_PASS    = "Demo@pass1!";
const COURIER_USER  = "carlos.courier";
const COURIER_PASS  = "Demo@pass1!";

// Helper — navigate to /login and wait for the login form to actually render.
// We can't use waitForLoadState("networkidle") because Vite HMR keeps a
// WebSocket open, and React's me() call fires after static assets load — so
// networkidle resolves too early while the spinner is still showing.
async function goToLogin(page: import("@playwright/test").Page) {
  await page.goto("/login");
  // Poll the DOM until the username input appears (me() resolved → isLoading=false)
  await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 20000 });
}

test.describe("Login page", () => {
  test.beforeEach(async ({ page }) => {
    await goToLogin(page);
  });

  test("shows login form with username and password fields", async ({ page }) => {
    await expect(page.getByPlaceholder("Enter your username")).toBeVisible();
    await expect(page.getByPlaceholder("Enter your password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("admin login redirects to /admin/users", async ({ page }) => {
    await page.getByPlaceholder("Enter your username").fill(ADMIN_USER);
    await page.getByPlaceholder("Enter your password").fill(ADMIN_PASS);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/admin\/users/, { timeout: 15000 });
  });

  test("staff login redirects to /dashboard", async ({ page }) => {
    await page.getByPlaceholder("Enter your username").fill(STAFF_USER);
    await page.getByPlaceholder("Enter your password").fill(STAFF_PASS);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  });

  test("courier login redirects to /courier", async ({ page }) => {
    await page.getByPlaceholder("Enter your username").fill(COURIER_USER);
    await page.getByPlaceholder("Enter your password").fill(COURIER_PASS);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/courier/, { timeout: 15000 });
  });

  test("shows error banner for invalid credentials", async ({ page }) => {
    await page.getByPlaceholder("Enter your username").fill("nobody");
    await page.getByPlaceholder("Enter your password").fill("wrongpass");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("text=⚠️")).toBeVisible({ timeout: 10000 });
  });
});

