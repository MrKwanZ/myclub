import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { formatLongDate } from "@myclub/shared";
import type { Page } from "@playwright/test";
import { API_URL, offsetDaysISO, uniqueEmail } from "../fixtures/api";
import { expect, test } from "../fixtures/test";
import { AuthPage } from "../pages/AuthPage";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://myclub:myclub_local@localhost:5432/myclub_test";

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

/** Records a toast through the API, then moves it outside the three-day window. */
async function seedOldNotification(token: string, title: string) {
  const res = await fetch(`${API_URL}/me/notifications`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title }),
  });
  expect(res.ok).toBe(true);
  execFileSync("npx", ["prisma", "db", "execute", "--url", TEST_DATABASE_URL, "--stdin"], {
    cwd: resolve(__dirname, "../../../api"),
    input: `UPDATE "Notification" SET "createdAt" = NOW() - INTERVAL '4 days' WHERE "title" = '${title}';`,
    stdio: ["pipe", "ignore", "inherit"],
  });
}

test.describe("Notification centre", () => {
  test("player toasts move into the centre and redirect by type", async ({ page, api }) => {
    test.setTimeout(90_000);
    const mgr = await api.bootstrapManagerClub("notif");
    const playerName = "Nora Notify";
    const { player } = await api.createPlayer(mgr.token, mgr.clubId, {
      name: playerName,
      position: "Forward",
      shirtNumber: 7,
      status: "active",
    });
    const email = uniqueEmail("nora");
    const password = "Password123!";
    await api.createPlayerAccount(mgr.token, mgr.clubId, player.id, { email, password });
    const eventDate = offsetDaysISO(4);
    await api.createEvent(mgr.token, mgr.clubId, {
      type: "training",
      name: "Notify Training",
      date: eventDate,
      startTime: "19:00",
      location: "Pitch B",
    });

    const auth = new AuthPage(page);
    await auth.gotoLogin();
    await auth.login(email, password);
    await expect(page).toHaveURL(/\/play/);

    const incoming = visibleToasts(page).filter({ hasText: "Incoming Event" });
    await expect(incoming).toBeVisible();
    await expect(incoming).toContainText("Incoming Notify Training on");
    await expect(incoming).toContainText(formatLongDate(eventDate));
    await expect(incoming).toContainText("Please reply your availability");
    await expect(visibleToasts(page).filter({ hasText: `Welcome ${playerName}` })).toHaveCount(0);

    await openCentre(page);
    await expect(visibleToasts(page)).toHaveCount(0);
    const box = await bell(page).boundingBox();
    const popover = await centre(page).boundingBox();
    expect(box && popover && popover.y >= box.y + box.height).toBe(true);

    await centre(page).getByRole("button", { name: /Incoming Event/ }).click();
    await expect(page).toHaveURL(new RegExp(`/play/calendar\\?date=${eventDate}`));
    await expect(page.getByRole("heading", { name: formatLongDate(eventDate) })).toBeVisible();
    await expect(page.getByText("Notify Training")).toBeVisible();

    await page.goto("/play");
    await page.getByRole("button", { name: "RSVP" }).first().click();
    await page.getByRole("menuitemradio", { name: "Yes" }).click();
    await expect(visibleToasts(page).filter({ hasText: "You replied Yes" })).toBeVisible();

    await openCentre(page);
    await expect(visibleToasts(page)).toHaveCount(0);
    await centre(page).getByRole("button", { name: /You replied Yes/ }).click();
    await expect(page).toHaveURL(/\/play\?tab=attendance/);
    await expect(page.getByRole("tab", { name: "My Attendance" })).toHaveAttribute("aria-selected", "true");
  });

  test("manager centre sits beside page actions, keeps three days, and ignores other clicks", async ({ page, api }) => {
    const mgr = await api.bootstrapManagerClub("notifmgr");
    const oldTitle = `Old toast ${Date.now()}`;
    await seedOldNotification(mgr.token, oldTitle);

    const auth = new AuthPage(page);
    await auth.gotoLogin();
    await auth.login(mgr.email, mgr.password);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(visibleToasts(page).filter({ hasText: "Welcome" })).toHaveCount(0);

    await page.goto("/finance");
    const create = page.getByRole("button", { name: "Create Transaction" });
    await expect(create).toBeVisible();
    const bellBox = await bell(page).boundingBox();
    const createBox = await create.boundingBox();
    expect(bellBox && createBox && bellBox.x + bellBox.width <= createBox.x).toBe(true);

    const keptTitle = `Kept toast ${Date.now()}`;
    const saved = await fetch(`${API_URL}/me/notifications`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${mgr.token}` },
      body: JSON.stringify({ title: keptTitle }),
    });
    expect(saved.ok).toBe(true);

    await openCentre(page);
    const item = centre(page).getByRole("button", { name: keptTitle });
    await expect(item).toBeVisible();
    await expect(centre(page).getByText(oldTitle)).toHaveCount(0);

    await item.click();
    await expect(page).toHaveURL(/\/finance$/);
    await expect(centre(page)).toBeVisible();
  });
});
