import { test, expect } from "@playwright/test";

test.describe("App health", () => {
  test("login page is reachable and renders the form", async ({ page }) => {
    const response = await page.goto("/login");
    expect(response?.status()).toBeLessThan(400);
    await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 20000 });
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("unauthenticated access to /dashboard redirects to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/login/, { timeout: 20000 });
    await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 20000 });
  });

  test("unauthenticated access to /admin/users redirects to /login", async ({ page }) => {
    await page.goto("/admin/users");
    await page.waitForURL(/\/login/, { timeout: 20000 });
    await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 20000 });
  });
});

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.waitForSelector('input[placeholder="Enter your username"]', { timeout: 20000 });
    await page.getByPlaceholder("Enter your username").fill("alice.staff");
    await page.getByPlaceholder("Enter your password").fill("Demo@pass1!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
    await page.waitForLoadState("networkidle");
  });

  test("dashboard page renders without JS errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.waitForTimeout(500); // let any deferred renders settle
    expect(errors).toHaveLength(0);
  });

  test("dashboard page contains visible content", async ({ page }) => {
    const body = await page.locator("body").innerText();
    expect(body.trim().length).toBeGreaterThan(0);
  });
});
