import { test, expect } from "../fixtures/test";
import { AuthPage } from "../pages/AuthPage";
import { ShellPage } from "../pages/ShellPage";
import { e2eApi, uniqueEmail } from "../fixtures/api";
import { SEED } from "../fixtures/seed";

test.describe("Super admin role", () => {
  test("administrator signs in and can open every club", async ({ page }) => {
    const auth = new AuthPage(page);
    const shell = new ShellPage(page);
    await auth.gotoLogin();
    await auth.login(SEED.admin.email, SEED.admin.password);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: /Administrator/ })).toBeVisible();

    const accountNav = page.getByRole("navigation", { name: "Account" });
    const buttons = accountNav.getByRole("button");
    await expect(buttons.nth(0)).toContainText("Administrator");
    await expect(buttons.nth(0)).toContainText("Super Admin");
    await expect(buttons.nth(1)).toContainText("Admin Panel");
    await expect(buttons.nth(2)).toContainText("Sign Out");

    await expect(page.getByTestId("club-switcher")).toBeVisible();
    await shell.switchClub(SEED.manager.clubName);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: /Administrator/ })).toBeVisible();
    await expect(shell.navLink("Roster")).toBeVisible();
    await expect(page.getByTestId("admin-panel-link")).toBeVisible();
  });

  test.describe("other roles", () => {
    test.describe("manager", () => {
      test.use({ storageState: "e2e/.auth/manager.json" });

      test("does not see Admin Panel and is sent back from /admin", async ({ page }) => {
        await page.goto("/dashboard");
        await expect(page.getByTestId("admin-panel-link")).toHaveCount(0);
        await page.goto("/admin");
        await expect(page).toHaveURL(/\/dashboard/);
      });
    });

    test.describe("player", () => {
      test.use({ storageState: "e2e/.auth/player.json" });

      test("is sent away from /admin", async ({ page }) => {
        await page.goto("/admin");
        await expect(page).toHaveURL(/\/play/);
      });
    });
  });
});

test.describe("Admin panel", () => {
  test("edits and deletes a user and a club", async ({ page }) => {
    const email = uniqueEmail("panel");
    const createdName = "Panel Temp";
    await e2eApi.register({ email, name: createdName, password: "Password123!" });
    const admin = await e2eApi.login({ email: SEED.admin.email, password: SEED.admin.password });
    const created = await e2eApi.createClub(admin.token, { name: "Temp Club Edit" });

    const auth = new AuthPage(page);
    await auth.gotoLogin();
    await auth.login(SEED.admin.email, SEED.admin.password);
    await page.getByTestId("admin-panel-link").click();
    await expect(page.getByRole("heading", { name: "Admin Panel" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "User" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Club" })).toBeVisible();

    const userScroll = page.getByTestId("admin-user-scroll");
    await userScroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const userRow = page.getByRole("row", { name: new RegExp(createdName) });
    await expect(userRow).toBeVisible();
    await expect(userRow.getByText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2} (AM|PM)/).first()).toBeVisible();
    await userRow.getByRole("button", { name: `Actions for ${createdName}` }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    const userDialog = page.getByRole("dialog", { name: "Edit user" });
    await userDialog.getByLabel("Name").fill("Panel Edited");
    await userDialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("rowheader", { name: "Panel Edited" })).toBeVisible();

    const editedRow = page.getByRole("row", { name: /Panel Edited/ });
    await editedRow.getByRole("button", { name: "Actions for Panel Edited" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    const deleteUser = page.getByRole("dialog", { name: "Delete user" });
    await deleteUser.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("rowheader", { name: "Panel Edited" })).toHaveCount(0);

    await page.getByRole("tab", { name: "Club" }).click();
    const clubRow = page.getByRole("row", { name: /Temp Club Edit/ });
    await expect(clubRow.getByText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2} (AM|PM)/).first()).toBeVisible();
    await clubRow.getByRole("button", { name: "Actions for Temp Club Edit" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    const clubDialog = page.getByRole("dialog", { name: "Edit club" });
    await clubDialog.getByLabel("Club name").fill("Temp Club Edited");
    await clubDialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("rowheader", { name: "Temp Club Edited" })).toBeVisible();

    const renamed = page.getByRole("row", { name: /Temp Club Edited/ });
    await renamed.getByRole("button", { name: "Actions for Temp Club Edited" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    const deleteClub = page.getByRole("dialog", { name: "Delete club" });
    await deleteClub.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("rowheader", { name: "Temp Club Edited" })).toHaveCount(0);
    expect(created.club.id).toBeTruthy();
  });

  test("shows the first 10 clubs and loads more on scroll", async ({ page }) => {
    const admin = await e2eApi.login({ email: SEED.admin.email, password: SEED.admin.password });
    for (let index = 1; index <= 12; index += 1) {
      await e2eApi.createClub(admin.token, { name: `ZZ Page ${String(index).padStart(2, "0")}` });
    }

    const auth = new AuthPage(page);
    await auth.gotoLogin();
    await auth.login(SEED.admin.email, SEED.admin.password);
    await page.getByTestId("admin-panel-link").click();
    await page.getByRole("tab", { name: "Club" }).click();

    await expect(page.getByRole("rowheader", { name: "ZZ Page 06" })).toHaveCount(1);
    await expect(page.getByRole("rowheader", { name: "ZZ Page 07" })).toHaveCount(0);

    const scroller = page.getByTestId("admin-club-scroll");
    await scroller.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await expect(page.getByRole("rowheader", { name: "ZZ Page 07" })).toHaveCount(1);
  });
});
