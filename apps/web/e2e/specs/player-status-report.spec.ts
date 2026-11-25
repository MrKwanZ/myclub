import { injuryStatusMessage, leaveStatusMessage, formatDayMonth } from "@myclub/shared";
import { AuthPage } from "../pages/AuthPage";
import { ShellPage } from "../pages/ShellPage";
import { uniqueEmail } from "../fixtures/api";
import { expect, test } from "../fixtures/test";

function isoOn(day: number) {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${String(day).padStart(2, "0")}`;
}

function dayLabel(day: number) {
  const month = new Date().toLocaleDateString("en-GB", { month: "long" });
  return new RegExp(`${month} ${day},`);
}

test.describe("Player status reports", () => {
  test("reports update the roster and toast the manager on the next login", async ({ page, api }) => {
    test.setTimeout(90_000);
    const mgr = await api.bootstrapManagerClub("status");
    const playerName = "Sam Status";
    const { player } = await api.createPlayer(mgr.token, mgr.clubId, {
      name: playerName,
      position: "Forward",
      shirtNumber: 9,
      status: "active",
    });
    const email = uniqueEmail("statusplayer");
    const password = "Password123!";
    await api.createPlayerAccount(mgr.token, mgr.clubId, player.id, { email, password });

    const auth = new AuthPage(page);
    const shell = new ShellPage(page);
    await auth.gotoLogin();
    await auth.login(email, password);
    await expect(page).toHaveURL(/\/play/);
    await expect(page.getByTestId("update-status")).toBeVisible();
    await expect(page.getByTestId("theme-toggle")).toHaveCount(0);

    await page.getByTestId("update-status").hover();
    await expect(page.getByRole("tooltip")).toContainText("Update Status");

    await page.getByTestId("update-status").click();
    await page.getByRole("menuitem", { name: "Injury Update" }).click();
    const injury = page.getByRole("dialog", { name: "Injury Update" });
    await injury.getByLabel("Injured Area").fill("Ankle");
    await injury.getByLabel("Remarks").fill("Twisted in training");
    await injury.locator("[data-slot='date-picker-trigger']").click();
    await page.getByRole("grid", { name: "Expected Return Date" }).getByRole("button", { name: dayLabel(15) }).click();
    await injury.getByRole("button", { name: "Submit" }).click();
    await expect(injury).toBeHidden();

    await shell.signOut();
    await auth.login(mgr.email, mgr.password);
    await expect(page).toHaveURL(/\/dashboard/);
    const injuryMessage = injuryStatusMessage(playerName, "Ankle", isoOn(15));
    await expect(page.getByText(injuryMessage)).toBeVisible();
    await expect(page.getByText("Twisted in training")).toBeVisible();
    await expect(page.getByText(injuryMessage)).toBeHidden({ timeout: 12_000 });

    await page.goto(`/roster/${player.id}`);
    await expect(page.getByText("Injured", { exact: true })).toBeVisible();
    await expect(page.getByText("Expected return date")).toBeVisible();
    await expect(page.getByText(formatDayMonth(isoOn(15)))).toBeVisible();

    await shell.signOut();
    await auth.login(mgr.email, mgr.password);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText(injuryMessage)).toHaveCount(0);

    await shell.signOut();
    await auth.login(email, password);
    await expect(page).toHaveURL(/\/play/);
    await page.getByTestId("update-status").click();
    await page.getByRole("menuitem", { name: "Request on Leave" }).click();
    const leave = page.getByRole("dialog", { name: "Request on Leave" });
    await leave.locator("[data-slot='date-range-picker-trigger']").click();
    const grid = page.getByRole("grid", { name: "Leave Period" });
    await grid.getByRole("button", { name: dayLabel(10) }).click();
    await grid.getByRole("button", { name: dayLabel(20) }).click();
    await leave.getByRole("button", { name: "Submit" }).click();
    await expect(leave).toBeHidden();

    await shell.signOut();
    await auth.login(mgr.email, mgr.password);
    const leaveMessage = leaveStatusMessage(playerName, isoOn(10), isoOn(20));
    await expect(page.getByText(leaveMessage)).toBeVisible();
    await expect(page.getByText(injuryMessage)).toHaveCount(0);

    await page.goto(`/roster/${player.id}`);
    await expect(page.getByText("On Leave", { exact: true })).toBeVisible();
    await expect(page.getByText(formatDayMonth(isoOn(10)))).toBeVisible();
    await expect(page.getByText(formatDayMonth(isoOn(20)))).toBeVisible();
    await expect(page.getByText("Expected return date")).toHaveCount(0);
  });
});
