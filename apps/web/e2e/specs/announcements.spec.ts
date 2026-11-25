import type { Page } from "@playwright/test";
import { uniqueEmail } from "../fixtures/api";
import { expect, test } from "../fixtures/test";
import { AuthPage } from "../pages/AuthPage";
import { ShellPage } from "../pages/ShellPage";

function bell(page: Page) {
  return page.getByRole("button", { name: "Notifications" });
}

function centre(page: Page) {
  return page.getByRole("dialog", { name: "Notifications" });
}

function visibleToasts(page: Page) {
  return page.locator('[data-slot="toast"]:not([data-exiting="true"]):not([data-hidden="true"])');
}

async function openCentre(page: Page) {
  await bell(page).click();
  await expect(centre(page)).toBeVisible();
  await expect(centre(page).locator("[data-slot='spinner']")).toHaveCount(0);
}

async function closeCentre(page: Page) {
  await page.keyboard.press("Escape");
  await expect(centre(page)).toBeHidden();
}

test.describe("Manager announcements", () => {
  test("a manager posts an announcement and members see it once, in the notification centre", async ({ page, api }) => {
    test.setTimeout(90_000);
    const mgr = await api.bootstrapManagerClub("announce");
    const { player } = await api.createPlayer(mgr.token, mgr.clubId, {
      name: "Ada Announce",
      position: "Midfielder",
      shirtNumber: 8,
      status: "active",
    });
    const email = uniqueEmail("ada");
    const password = "Password123!";
    await api.createPlayerAccount(mgr.token, mgr.clubId, player.id, { email, password });

    const title = `Pitch closed ${Date.now()}`;
    const content = "Training moves to Sunday morning.";
    const auth = new AuthPage(page);
    const shell = new ShellPage(page);

    await auth.gotoLogin();
    await auth.login(mgr.email, mgr.password);
    await expect(page).toHaveURL(/\/dashboard/);
    const create = page.getByRole("button", { name: "New Announcement" });
    await expect(create).toBeVisible();
    const bellBox = await bell(page).boundingBox();
    const createBox = await create.boundingBox();
    expect(bellBox && createBox && bellBox.x + bellBox.width <= createBox.x).toBe(true);

    await create.click();
    const dialog = page.getByRole("dialog", { name: "New Announcement" });
    await expect(dialog.getByLabel("Title")).toBeVisible();
    await expect(dialog.getByLabel("Content")).toBeVisible();
    await dialog.getByRole("button", { name: "Add Announcement" }).click();
    await expect(visibleToasts(page).filter({ hasText: "Title is required" })).toBeVisible();

    await dialog.getByLabel("Title").fill(title);
    await dialog.getByLabel("Content").fill(content);
    await dialog.getByRole("button", { name: "Add Announcement" }).click();
    await expect(dialog).toBeHidden();
    await expect(visibleToasts(page).filter({ hasText: "Announcement created successfully" })).toBeVisible();

    await openCentre(page);
    await expect(visibleToasts(page)).toHaveCount(0);
    await expect(centre(page).getByText("Announcement created successfully")).toBeVisible();
    await closeCentre(page);

    await shell.signOut();
    await auth.login(email, password);
    await expect(page).toHaveURL(/\/play/);
    await expect(page.getByRole("button", { name: "New Announcement" })).toHaveCount(0);
    const announcement = visibleToasts(page).filter({ hasText: title });
    await expect(announcement).toBeVisible();
    await expect(visibleToasts(page).filter({ hasText: content })).toBeVisible();

    await openCentre(page);
    await expect(visibleToasts(page)).toHaveCount(0);
    await centre(page).getByRole("button", { name: new RegExp(title) }).click();
    await expect(page).toHaveURL(/\/play$/);
    await expect(centre(page)).toBeVisible();
    await closeCentre(page);

    await shell.signOut();
    await auth.login(email, password);
    await expect(visibleToasts(page).filter({ hasText: "Welcome" })).toBeVisible();
    await expect(visibleToasts(page).filter({ hasText: title })).toHaveCount(0);

    await shell.signOut();
    await auth.login(mgr.email, mgr.password);
    await expect(visibleToasts(page).filter({ hasText: "Welcome" })).toBeVisible();
    await expect(visibleToasts(page).filter({ hasText: title })).toHaveCount(0);
    await expect(visibleToasts(page).filter({ hasText: "Announcement created successfully" })).toHaveCount(0);
  });
});
