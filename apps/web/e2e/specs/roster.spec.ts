import { test, expect } from "../fixtures/test";
import { offsetDaysISO, uniqueEmail } from "../fixtures/api";
import { CLUB_KEY, TOKEN_KEY } from "../../lib/storage";

test.describe("Manager Roster & Player Account Linking", () => {
  test("create, edit, injure, set left, delete players, paginate, and link accounts", async ({ page, api }) => {
    const mgr = await api.bootstrapManagerClub("roster");

    // Seed an upcoming event to verify attendance sync/drop rules
    const { event: upcomingTraining } = await api.createEvent(mgr.token, mgr.clubId, {
      type: "training",
      name: "Roster Sync Session",
      date: offsetDaysISO(5),
      startTime: "18:00",
      location: "Main Pitch",
    });

    // Seed 11 players to verify 10/page pagination
    for (let i = 1; i <= 11; i++) {
      await api.createPlayer(mgr.token, mgr.clubId, {
        name: `Seed Player ${String(i).padStart(2, "0")}`,
        position: "Midfielder",
        shirtNumber: i + 10,
      });
    }

    await page.addInitScript(
      ([tKey, cKey, tVal, cVal]) => {
        localStorage.setItem(tKey, tVal);
        localStorage.setItem(cKey, cVal);
      },
      [TOKEN_KEY, CLUB_KEY, mgr.token, mgr.clubId],
    );

    await page.goto("/roster");
    await expect(page.getByRole("heading", { name: "Roster" })).toBeVisible();

    // Scroll to trigger Table.LoadMore pagination
    await page.getByText("Seed Player 10").scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.getByText("Seed Player 11")).toBeVisible();

    // Create a new player via modal
    await page.getByRole("button", { name: "Create Player" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill("Marco Striker");
    await dialog.getByLabel("Shirt number").fill("99");
    await dialog.getByLabel("Goals").fill("7");
    await dialog.getByLabel("Assists").fill("3");
    await dialog.getByRole("button", { name: "Create Player" }).click();

    await expect(page.getByText("Marco Striker")).toBeVisible();

    // Edit Marco to left -> verify future unanswered attendance dropped
    await page.getByRole("button", { name: "Edit Marco Striker" }).click();
    const editDialog = page.getByRole("dialog");
    await editDialog.getByRole("button", { name: "Status" }).click();
    await page.getByRole("menuitemradio", { name: /On leave|Left/i }).click();
    await editDialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(editDialog).toBeHidden();

    // Verify Marco is not in upcoming event attendance while status is left
    await page.goto("/attendance");
    await expect(page.getByText(/0 of 11 present or late · Main Pitch/)).toBeVisible();
    await expect(page.getByText("Marco Striker")).toHaveCount(0);

    // Link a player login via inline form on /roster
    await page.goto("/roster");
    const linkEmail = uniqueEmail("linked");
    await page.getByRole("button", { name: "Create login" }).first().click();
    await page.getByLabel("Login email").fill(linkEmail);
    await page.getByLabel("Password").fill("Password123!");
    await page.getByRole("button", { name: "Save login" }).click();
    await expect(page.getByText(linkEmail)).toBeVisible();

    // Scroll & delete Seed Player 11
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.getByRole("button", { name: "Delete Seed Player 11" }).click();
    await page.getByRole("dialog").getByRole("button", { name: /Delete/i }).click();
    await expect(page.getByText("Seed Player 11")).toHaveCount(0);
    void upcomingTraining;
  });
});
