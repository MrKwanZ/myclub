import { test, expect } from "../fixtures/test";
import { offsetDaysISO, uniqueEmail } from "../fixtures/api";
import { CLUB_KEY, TOKEN_KEY } from "../../lib/storage";

test.describe("Player Flows (/play, /play/calendar, /play/attendance)", () => {
  test.describe("Linked player", () => {
    test.use({ storageState: "e2e/.auth/player.json" });

    test("player replies to upcoming session, views calendar, and checks attendance history", async ({ page }) => {
      await page.goto("/play");
      await expect(page.getByText("Evening Tactical Session")).toBeVisible();

      await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Sam Striker/ })).toBeVisible();
      await expect(page.getByText("Pending Reply")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "RSVP" }).first()).toBeVisible();

      // Reply Yes -> present. Unanswered events start on RSVP.
      await page.getByRole("button", { name: "RSVP" }).first().click();
      await page.getByRole("menuitemradio", { name: "Yes" }).click();
      await expect(page.getByRole("button", { name: "Yes" }).first()).toBeVisible();

      // /play/calendar shows calendar & event without manager Add Event button
      await page.goto("/play/calendar");
      await expect(page.getByRole("button", { name: /Add Event/i })).toHaveCount(0);
      await expect(page.getByTestId(`calendar-cell-${offsetDaysISO(0)}`)).toBeVisible();

      // /play/attendance shows past attendance history
      await page.goto("/play/attendance");
      await expect(page).toHaveURL(/\/play\?tab=attendance/);
      await expect(page.getByRole("tab", { name: "My Attendance" })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByText(/City Rovers/)).toBeVisible();
    });
  });

  test("unlinked player membership (playerLinked === false) hides event list", async ({ page, api }) => {
    const mgr = await api.bootstrapManagerClub("unlink");
    const { player } = await api.createPlayer(mgr.token, mgr.clubId, {
      name: "Temp Player",
      status: "active",
    });
    const pEmail = uniqueEmail("unlinked");
    const pPass = "Password123!";
    await api.createPlayerAccount(mgr.token, mgr.clubId, player.id, {
      email: pEmail,
      password: pPass,
    });
    await api.createEvent(mgr.token, mgr.clubId, {
      type: "training",
      name: "Hidden Session",
      date: offsetDaysISO(1),
      startTime: "18:00",
      location: "Field 1",
    });
    // Deleting the player row leaves the Membership intact with playerLinked === false
    await api.deletePlayer(mgr.token, mgr.clubId, player.id);

    const loginRes = await api.login({ email: pEmail, password: pPass });
    await page.addInitScript(
      ([tKey, cKey, tVal, cVal]) => {
        localStorage.setItem(tKey, tVal);
        localStorage.setItem(cKey, cVal);
      },
      [TOKEN_KEY, CLUB_KEY, loginRes.token, mgr.clubId],
    );

    await page.goto("/play");
    await expect(page.getByText("Hidden Session")).toHaveCount(0);
  });
});
