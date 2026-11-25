import { test, expect } from "../fixtures/test";
import { offsetDaysISO, uniqueEmail } from "../fixtures/api";
import { CLUB_KEY, TOKEN_KEY } from "../../lib/storage";
import { formatEventWhen } from "@myclub/shared";

test.describe("Player dedicated dashboard", () => {
  test("home dashboard tabs show upcoming RSVP, past matches, and paged attendance", async ({ page, api }) => {
    const mgr = await api.bootstrapManagerClub("pdash");
    const { player } = await api.createPlayer(mgr.token, mgr.clubId, {
      name: "Riley Dash",
      position: "Forward",
      shirtNumber: 11,
      status: "active",
    });
    const email = uniqueEmail("riley");
    const password = "Password123!";
    await api.createPlayerAccount(mgr.token, mgr.clubId, player.id, { email, password });

    await api.createEvent(mgr.token, mgr.clubId, {
      type: "training",
      name: "Next Training",
      date: offsetDaysISO(2),
      startTime: "19:00",
      location: "Pitch A",
    });
    await api.createEvent(mgr.token, mgr.clubId, {
      type: "match",
      name: "Cup Final",
      date: offsetDaysISO(-5),
      startTime: "15:00",
      location: "Stadium",
      opponent: "Harbor United",
      scoreFor: 2,
      scoreAgainst: 1,
    });
    await api.createEvent(mgr.token, mgr.clubId, {
      type: "match",
      name: "Level Fixture",
      date: offsetDaysISO(-20),
      startTime: "15:00",
      location: "Away",
      opponent: "Old Town",
      scoreFor: 1,
      scoreAgainst: 1,
    });
    await api.createEvent(mgr.token, mgr.clubId, {
      type: "match",
      name: "Defeat Fixture",
      date: offsetDaysISO(-21),
      startTime: "15:00",
      location: "Away",
      opponent: "Rivals FC",
      scoreFor: 0,
      scoreAgainst: 2,
    });

    for (let i = 1; i <= 8; i += 1) {
      const { event } = await api.createEvent(mgr.token, mgr.clubId, {
        type: "training",
        name: `History ${i}`,
        date: offsetDaysISO(-i),
        startTime: `${10 + i}:00`,
        location: "Pitch",
      });
      if (i === 1) {
        await api.setAttendance(mgr.token, mgr.clubId, event.id, { playerId: player.id, status: "present" });
      }
    }

    const login = await api.login({ email, password });
    await page.addInitScript(
      ([tKey, cKey, tVal, cVal]) => {
        localStorage.setItem(tKey, tVal);
        localStorage.setItem(cKey, cVal);
      },
      [TOKEN_KEY, CLUB_KEY, login.token, mgr.clubId],
    );

    await page.goto("/play");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("button", { name: "My attendance" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Upcoming Event" })).toHaveAttribute("aria-selected", "true");

    const upcoming = page.locator(".event-card").filter({ hasText: "Next Training" });
    await expect(upcoming.getByText("Pending Reply")).toBeVisible();
    await upcoming.getByRole("button", { name: "RSVP" }).click();
    await expect(page.getByRole("menuitemradio", { name: "RSVP" })).toBeVisible();
    await expect(page.getByRole("menuitemradio", { name: "Yes" })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("tab", { name: "Past Matches" }).click();
    const win = page.locator(".event-card").filter({ hasText: "Harbor United" });
    await expect(win.locator(".score-win")).toHaveText("2–1");
    const draw = page.locator(".event-card").filter({ hasText: "Old Town" });
    await expect(draw.locator(".score-win, .score-loss")).toHaveCount(0);
    await expect(draw.getByText("1–1")).toBeVisible();
    const loss = page.locator(".event-card").filter({ hasText: "Rivals FC" });
    await expect(loss.locator(".score-loss")).toHaveText("0–2");
    await expect(page.getByText(/\bwin\b|\bloss\b|\bdraw\b/i)).toHaveCount(0);

    await page.getByRole("tab", { name: "My Attendance" }).click();
    const newest = formatEventWhen(offsetDaysISO(-1), "11:00");
    const oldest = formatEventWhen(offsetDaysISO(-8), "18:00");
    await expect(page.getByRole("row").filter({ hasText: newest })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "Present" })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: oldest })).toHaveCount(0);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.getByRole("row").filter({ hasText: oldest })).toBeVisible();
  });
});
