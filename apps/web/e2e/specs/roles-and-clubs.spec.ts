import { test, expect } from "../fixtures/test";
import { ShellPage } from "../pages/ShellPage";
import { SEED } from "../fixtures/seed";

test.describe("Role guards, multi-club switching, and theme", () => {
  test("unauthenticated visitor is redirected from protected routes to /login", async ({ page }) => {
    for (const route of ["/dashboard", "/roster", "/calendar", "/finance", "/account", "/play"]) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test.describe("Manager route guards", () => {
    test.use({ storageState: "e2e/.auth/manager.json" });

    test("manager cannot access /play* and /club redirects to /account", async ({ page }) => {
      await page.goto("/play");
      await expect(page).toHaveURL(/\/dashboard/);

      await page.goto("/club");
      await expect(page).toHaveURL(/\/account/);
    });

    test("theme toggle persists dark class on html", async ({ page }) => {
      const shell = new ShellPage(page);
      await page.goto("/dashboard");
      await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Alex Manager/ })).toBeVisible();
      await expect(page.getByTestId("theme-toggle")).toHaveCount(0);

      await page.goto("/account");
      await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
      await page.getByRole("button", { name: "Personal" }).click();
      await expect(page.getByRole("switch", { name: "Dark mode" })).toBeVisible();

      const beforeDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
      await shell.toggleTheme();
      const afterDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
      expect(afterDark).toBe(!beforeDark);
    });
  });

  test.describe("Player route guards", () => {
    test.use({ storageState: "e2e/.auth/player.json" });

    test("player is redirected away from manager routes to /play", async ({ page }) => {
      for (const route of ["/dashboard", "/roster", "/calendar", "/matches", "/attendance", "/finance", "/account"]) {
        await page.goto(route);
        await expect(page).toHaveURL(/\/play/);
      }
    });
  });

  test.describe("Multi-club switcher", () => {
    test.use({ storageState: "e2e/.auth/multi-club.json" });

    test("switching clubs changes role, sidebar nav, and scoped data", async ({ page }) => {
      const shell = new ShellPage(page);
      await page.goto("/dashboard");
      await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Jordan Dual/ })).toBeVisible();
      await expect(shell.navLink("Roster")).toBeVisible();

      // Switch to Beta Played United where user is a player
      await shell.switchClub(SEED.multi.playedClubName);
      await expect(page).toHaveURL(/\/play/);
      await expect(shell.navLink("Dashboard")).toBeVisible();
      await expect(page.getByText("Beta Midweek Training")).toBeVisible();

      // Switch back to Alpha Managed FC where user is manager
      await shell.switchClub(SEED.multi.managedClubName);
      await expect(page).toHaveURL(/\/dashboard/);
      await expect(shell.navLink("Roster")).toBeVisible();
    });
  });
});
