/**
 * E2E tests — Courier page & My Tasks (shell-only)
 *
 * UI-only checks that don't depend on delivery/task lists loading.
 */
import { test, expect } from "@playwright/test";

const COURIER_USER = "carlos.courier";
const COURIER_PASS = "Demo@pass1!";
const STAFF_USER   = "alice.staff";
const STAFF_PASS   = "Demo@pass1!";

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

test.describe("Courier — deliveries page shell", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, COURIER_USER, COURIER_PASS);
    await expect(page).toHaveURL(/\/courier/, { timeout: 15000 });
  });

  test("page has visible content", async ({ page }) => {
    const body = await page.locator("body").innerText();
    expect(body.trim().length).toBeGreaterThan(0);
  });

  test("page renders without JS errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.waitForTimeout(500);
    expect(errors).toHaveLength(0);
  });
});

test.describe("My Tasks — staff view (shell)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, STAFF_USER, STAFF_PASS);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
    await expect(page.getByRole("link", { name: "Tasks" })).toBeVisible({ timeout: 10000 });
    await page.getByRole("link", { name: "Tasks" }).click();
    await page.waitForURL(/\/meetings\/tasks/, { timeout: 10000 });
    await expect(page.getByRole("heading", { name: /My Tasks/i })).toBeVisible({ timeout: 10000 });
  });

  test("page heading shows My Tasks", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /My Tasks/i })).toBeVisible();
  });

  test("Refresh button is present", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Refresh/i })).toBeVisible();
  });

  test("status filter has To Do, In Progress and Done options", async ({ page }) => {
    const select = page.getByRole("combobox").first();
    await expect(select).toBeVisible();
    const options = await select.locator("option").allTextContents();
    expect(options.some((o) => /to.?do/i.test(o))).toBe(true);
    expect(options.some((o) => /in.?progress/i.test(o))).toBe(true);
    expect(options.some((o) => /done/i.test(o))).toBe(true);
  });
});
