import { test, expect } from "../fixtures/test";
import { offsetDaysISO } from "../fixtures/api";
import { CLUB_KEY, TOKEN_KEY } from "../../lib/storage";

test.describe("Manager Calendar, Matches & Attendance", () => {
  test("create/edit events on calendar, record match score, and mark attendance", async ({ page, api }) => {
    const mgr = await api.bootstrapManagerClub("cma");
    const { player: p1 } = await api.createPlayer(mgr.token, mgr.clubId, {
      name: "Chris Midfielder",
      position: "Midfielder",
      shirtNumber: 8,
    });
    const { player: p2 } = await api.createPlayer(mgr.token, mgr.clubId, {
      name: "Dana Defender",
      position: "Defender",
      shirtNumber: 4,
    });

    // Seed a past match without score and a future match
    await api.createEvent(mgr.token, mgr.clubId, {
      type: "match",
      name: "Derby Clash",
      date: offsetDaysISO(-2),
      startTime: "14:00",
      location: "Stadium",
      opponent: "United FC",
    });
    await api.createEvent(mgr.token, mgr.clubId, {
      type: "match",
      name: "Next Week Cup",
      date: offsetDaysISO(7),
      startTime: "16:00",
      location: "Away Ground",
      opponent: "Athletic",
    });

    await page.addInitScript(
      ([tKey, cKey, tVal, cVal]) => {
        localStorage.setItem(tKey, tVal);
        localStorage.setItem(cKey, cVal);
      },
      [TOKEN_KEY, CLUB_KEY, mgr.token, mgr.clubId],
    );

    // 1. Calendar: verify two-month calendar & create a training event
    await page.goto("/calendar");
    await expect(page.getByRole("heading", { name: "Incoming Events" })).toBeVisible();
    const todayCell = page.getByTestId(`calendar-cell-${offsetDaysISO(0)}`);
    await expect(todayCell).toBeVisible();

    await page.getByRole("button", { name: "New Event" }).click();
    const modal = page.getByRole("dialog");
    await modal.getByLabel("Event Name").fill("Friday Fitness");
    await modal.getByLabel("Location").fill("Track Field");
    await modal.getByRole("button", { name: "Add Event" }).click();
    await expect(modal).toBeHidden();
    await expect(page.getByText("Friday Fitness")).toBeVisible();

    // 2. Matches: record score for past match -> win; future match scores disabled
    await page.goto("/matches");
    await expect(page.getByRole("textbox", { name: "Opponent" }).first()).toHaveValue("United FC");
    const ourScoreInputs = page.getByLabel("Our score");
    const theirScoreInputs = page.getByLabel("Their score");
    await expect(ourScoreInputs.nth(1)).toBeDisabled();
    await ourScoreInputs.nth(0).fill("2");
    await theirScoreInputs.nth(0).fill("0");
    await page.getByRole("button", { name: "Save result" }).first().click();
    await expect(page.getByText(/win/i).first()).toBeVisible();

    // 3. Attendance: mark p1 present and p2 late -> both count as attended
    await page.goto("/attendance");
    await expect(page.getByText("Chris Midfielder")).toBeVisible();
    await expect(page.getByText("Dana Defender")).toBeVisible();

    const selects = page.locator("table select");
    await selects.nth(0).selectOption("present");
    await selects.nth(1).selectOption("late");
    await expect(page.getByText(/2 of 2 present or late/i)).toBeVisible();
    void p1;
    void p2;
  });
});
