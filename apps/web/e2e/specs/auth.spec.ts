import { test, expect } from "../fixtures/test";
import { AuthPage } from "../pages/AuthPage";
import { ShellPage } from "../pages/ShellPage";
import { uniqueEmail } from "../fixtures/api";
import { SEED } from "../fixtures/seed";

test.describe("Public landing, registration, login, and sign out", () => {
  test("landing page renders key sections, privacy link, and mobile drawer", async ({ page }, testInfo) => {
    await page.goto("/");
    if (testInfo.project.name === "chromium-mobile") {
      await page.getByRole("button", { name: /menu|open/i }).first().click();
      await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Create your club" })).toBeVisible();
      await page.getByRole("button", { name: "Close menu" }).click();
    } else {
      await expect(page.getByRole("link", { name: "START NOW" })).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: /Manage club resources/i })).toBeVisible();

    await page.getByRole("link", { name: /Privacy/i }).click();
    await expect(page).toHaveURL(/\/privacy/);
    await expect(page.getByRole("heading", { name: /Privacy/i })).toBeVisible();
  });

  test("7-step manager registration creates club and lands on dashboard", async ({ page }) => {
    const auth = new AuthPage(page);
    const email = uniqueEmail("reg");
    const clubName = `Reg FC ${Date.now().toString().slice(-4)}`;

    await auth.gotoRegister();
    await auth.registerClub({
      name: "Riley Manager",
      email,
      password: "Password123!",
      clubName,
      description: "Created via Playwright",
      goals: "Promote to division 1",
    });

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("invalid login shows error; valid manager and player logins route to role home and sign out clears storage", async ({
    page,
  }) => {
    const auth = new AuthPage(page);
    const shell = new ShellPage(page);

    await auth.gotoLogin();
    await auth.login(SEED.manager.email, "wrong-password");
    await expect(page.getByText(/invalid|incorrect|sign in/i).first()).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    await auth.login(SEED.manager.email, SEED.manager.password);
    await expect(page).toHaveURL(/\/dashboard/);

    // Signed-in user visiting / auto-redirects to /dashboard
    await page.goto("/");
    await expect(page).toHaveURL(/\/dashboard/);

    await shell.signOut();
    const token = await page.evaluate(() => localStorage.getItem("myclub_token"));
    expect(token).toBeNull();

    // Player login routes to /play
    await auth.login(SEED.player.email, SEED.player.password);
    await expect(page).toHaveURL(/\/play/);
  });
});
