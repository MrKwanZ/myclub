import { test, expect } from "../fixtures/test";
import { offsetDaysISO, uniqueEmail } from "../fixtures/api";
import { CLUB_KEY, TOKEN_KEY } from "../../lib/storage";

test.describe("Player Full Information View", () => {
  test("displays 4-column roster table, redirects to player detail, supports non-GK & GK stats, edit NumberFields, and delete", async ({
    page,
    api,
  }) => {
    const mgr = await api.bootstrapManagerClub("pinfo");

    // Seed 2 players: one Forward (non-GK) and one Goalkeeper
    const { player: striker } = await api.createPlayer(mgr.token, mgr.clubId, {
      name: "Alex Forward",
      position: "Forward",
      shirtNumber: 9,
      goals: 12,
      assists: 5,
      status: "active",
    });

    const { player: keeper } = await api.createPlayer(mgr.token, mgr.clubId, {
      name: "Sam Keeper",
      position: "Goalkeeper",
      shirtNumber: 1,
      status: "active",
    });

    // Seed 2 events: 1 training and 1 scored match (lost 2 goals)
    const { event: training } = await api.createEvent(mgr.token, mgr.clubId, {
      type: "training",
      name: "Tuesday Training",
      date: offsetDaysISO(2),
      startTime: "19:00",
      location: "Pitch A",
    });

    const { event: match } = await api.createEvent(mgr.token, mgr.clubId, {
      type: "match",
      name: "League Match 1",
      date: offsetDaysISO(-3),
      startTime: "15:00",
      location: "Stadium",
      opponent: "Rivals FC",
      scoreFor: 3,
      scoreAgainst: 2,
    });

    // Alex Forward replies "present" to training (1 of 2 events = 50%)
    await api.setAttendance(mgr.token, mgr.clubId, training.id, {
      playerId: striker.id,
      status: "present",
    });

    // Sam Keeper replies "maybe" to training and "present" to match (2 of 2 = 100%)
    await api.setAttendance(mgr.token, mgr.clubId, training.id, {
      playerId: keeper.id,
      status: "maybe",
    });
    await api.setAttendance(mgr.token, mgr.clubId, match.id, {
      playerId: keeper.id,
      status: "present",
    });

    // Link a login to Alex Forward
    const strikerEmail = uniqueEmail("alex");
    await api.createPlayerAccount(mgr.token, mgr.clubId, striker.id, {
      email: strikerEmail,
      password: "Password123!",
    });

    await page.addInitScript(
      ([tKey, cKey, tVal, cVal]) => {
        localStorage.setItem(tKey, tVal);
        localStorage.setItem(cKey, cVal);
      },
      [TOKEN_KEY, CLUB_KEY, mgr.token, mgr.clubId],
    );

    // 1. Verify Roster table has ONLY 4 columns: Player, Position, No., Status
    await page.goto("/roster");
    const headers = page.locator("table thead th");
    await expect(headers).toHaveCount(5);
    await expect(headers.nth(0)).toHaveText("Player");
    await expect(headers.nth(1)).toHaveText("Position");
    await expect(headers.nth(2)).toHaveText("No.");
    await expect(headers.nth(3)).toHaveText("Status");
    await expect(headers.nth(4)).toHaveText("Attendance");

    // 2. Click non-GK player name -> redirects to /roster/[id]
    const strikerLink = page.getByRole("link", { name: "Alex Forward" });
    await expect(strikerLink).toHaveAttribute("href", `/roster/${striker.id}`);
    await strikerLink.click();
    await expect(page).toHaveURL(new RegExp(`/roster/${striker.id}$`));

    // Verify Card header: H1 name, Chip status, H2 position
    await expect(page.getByRole("heading", { level: 1, name: "Alex Forward" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Forward" })).toBeVisible();
    await expect(page.getByText("Active")).toBeVisible();

    // Verify non-GK fields and no GK-specific fields
    await expect(page.getByText("Shirt number")).toBeVisible();
    await expect(page.getByText("Goals")).toBeVisible();
    await expect(page.getByText("Assists")).toBeVisible();
    await expect(page.getByText("Yellow cards")).toBeVisible();
    await expect(page.getByText("Red cards")).toBeVisible();
    await expect(page.getByText("Played minutes")).toBeVisible();
    await expect(page.getByText("Attendance")).toBeVisible();
    await expect(page.getByText("50%")).toBeVisible();
    await expect(page.getByText(strikerEmail)).toBeVisible();
    await expect(page.getByText("Saves")).toHaveCount(0);
    await expect(page.getByText("Save percentage")).toHaveCount(0);

    // 3. Top-right Actions Dropdown -> Edit with NumberField components
    await page.getByRole("button", { name: "Player actions" }).click();
    await expect(page.getByRole("menuitem", { name: "Edit" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
    await page.getByRole("menuitem", { name: "Edit" }).click();

    const editDialog = page.getByRole("dialog");
    await expect(editDialog.getByRole("textbox", { name: "Yellow cards" })).toBeVisible();
    await expect(editDialog.getByRole("textbox", { name: "Red cards" })).toBeVisible();
    await expect(editDialog.getByRole("textbox", { name: "Played minutes" })).toBeVisible();
    await expect(editDialog.getByRole("textbox", { name: "Saves" })).toHaveCount(0);

    await editDialog.getByRole("textbox", { name: "Yellow cards" }).fill("2");
    await editDialog.getByRole("textbox", { name: "Red cards" }).fill("1");
    await editDialog.getByRole("textbox", { name: "Played minutes" }).fill("270");
    await editDialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(editDialog).toBeHidden();

    await expect(page.getByRole("main").getByText("270")).toBeVisible();

    // 4. Navigate to Goalkeeper -> verify GK-specific Saves & Save percentage
    await page.goto(`/roster/${keeper.id}`);
    await expect(page.getByRole("heading", { level: 1, name: "Sam Keeper" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Goalkeeper" })).toBeVisible();
    await expect(page.getByText("100%")).toBeVisible();
    await expect(page.getByText("Saves")).toBeVisible();
    await expect(page.getByText("Save percentage")).toBeVisible();

    await page.getByRole("button", { name: "Player actions" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    const gkDialog = page.getByRole("dialog");
    await expect(gkDialog.getByRole("textbox", { name: "Saves" })).toBeVisible();
    await gkDialog.getByRole("textbox", { name: "Saves" }).fill("6");
    await gkDialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(gkDialog).toBeHidden();

    // 6 saves / (6 saves + 2 scoreAgainst) = 75%
    await expect(page.getByText("75%")).toBeVisible();

    // 5. Delete player from player information page -> redirects to /roster
    await page.getByRole("button", { name: "Player actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: /Delete/i }).click();
    await expect(page).toHaveURL(/\/roster$/);
    await expect(page.getByRole("link", { name: "Sam Keeper" })).toHaveCount(0);
  });
});
