import { test, expect } from "../fixtures/test";
import { CLUB_KEY, TOKEN_KEY } from "../../lib/storage";
import { formatDayMonth } from "@myclub/shared";

test.describe("Player information dates", () => {
  test("injured and on-leave forms use the date components, and the dates sit on the last row", async ({
    page,
    api,
  }) => {
    const mgr = await api.bootstrapManagerClub("dates");
    const { player } = await api.createPlayer(mgr.token, mgr.clubId, {
      name: "Casey Dates",
      position: "Defender",
      shirtNumber: 4,
      status: "active",
    });

    await page.addInitScript(
      ([tKey, cKey, tVal, cVal]) => {
        localStorage.setItem(tKey, tVal);
        localStorage.setItem(cKey, cVal);
      },
      [TOKEN_KEY, CLUB_KEY, mgr.token, mgr.clubId],
    );

    await page.goto(`/roster/${player.id}`);
    await expect(page.getByText("Expected return date")).toHaveCount(0);
    await expect(page.getByText("Leave from")).toHaveCount(0);
    await expect(page.getByText("Leave until")).toHaveCount(0);

    await page.getByRole("button", { name: "Player actions" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit Player" });
    await dialog.getByRole("button", { name: "Status" }).click();
    await page.getByRole("menuitemradio", { name: "Injured" }).click();
    await dialog.getByLabel("Injury Area").fill("Ankle");

    await expect(dialog.getByText("Expected Return Date")).toHaveCount(1);
    await expect(dialog.getByRole("grid")).toHaveCount(0);
    await expect(dialog.getByText("Leave period")).toHaveCount(0);

    await dialog.locator("[data-slot='date-picker-trigger']").click();
    const returnGrid = page.getByRole("grid", { name: "Expected Return Date" });
    await expect(returnGrid).toBeVisible();
    await returnGrid.getByRole("button", { name: /November 28,/ }).click();
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toBeHidden();

    const items = page.locator(".player-info-item");
    await expect(items.last()).toContainText("Expected return date");
    await expect(items.last()).toContainText(formatDayMonth(new Date().getFullYear() + "-" + String(new Date().getMonth() + 1).padStart(2, "0") + "-28"));
    await expect(page.getByText("Leave from")).toHaveCount(0);

    await page.getByRole("button", { name: "Player actions" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    const edit = page.getByRole("dialog", { name: "Edit Player" });
    await edit.getByRole("button", { name: "Status" }).click();
    await page.getByRole("menuitemradio", { name: "On Leave" }).click();
    await expect(edit.getByText("Expected Return Date")).toHaveCount(0);
    await expect(edit.getByRole("grid")).toHaveCount(0);
    await expect(edit.getByText("Leave period")).toHaveCount(1);
    await edit.locator("[data-slot='date-range-picker-trigger']").click();
    const leaveGrid = page.getByRole("grid", { name: "Leave period" });
    await expect(leaveGrid).toBeVisible();
    await leaveGrid.getByRole("button", { name: /November 10,/ }).click();
    await leaveGrid.getByRole("button", { name: /November 20,/ }).click();
    await edit.getByRole("button", { name: "Save", exact: true }).click();
    await expect(edit).toBeHidden();

    const month = String(new Date().getMonth() + 1).padStart(2, "0");
    const year = new Date().getFullYear();
    await expect(items.nth(-2)).toContainText("Leave from");
    await expect(items.nth(-2)).toContainText(formatDayMonth(`${year}-${month}-10`));
    await expect(items.last()).toContainText("Leave until");
    await expect(items.last()).toContainText(formatDayMonth(`${year}-${month}-20`));
    await expect(page.getByText("Leave from")).toBeVisible();
    await expect(page.getByText("Expected return date")).toHaveCount(0);
  });
});
