import { test, expect } from "../fixtures/test";
import { offsetDaysISO, uniqueEmail } from "../fixtures/api";
import { CLUB_KEY, TOKEN_KEY } from "../../lib/storage";
import { formatEventWhen } from "@myclub/shared";

test.describe("Attendance feature expansion", () => {
  test("roster shows the last five S/A chips, Maybe reminds the player, and past no-reply or Maybe reads as Absent", async ({
    page,
    api,
  }) => {
    const mgr = await api.bootstrapManagerClub("attend");
    const { player } = await api.createPlayer(mgr.token, mgr.clubId, {
      name: "Jordan Form",
      position: "Midfielder",
      shirtNumber: 8,
      status: "active",
    });
    const email = uniqueEmail("jordan");
    const password = "Password123!";
    await api.createPlayerAccount(mgr.token, mgr.clubId, player.id, { email, password });

    const past = [
      { days: -12, time: "10:00", name: "Oldest Session", status: "present" },
      { days: -8, time: "11:00", name: "Missed Session", status: "absent" },
      { days: -6, time: "12:00", name: "Silent Session", status: "unanswered" },
      { days: -4, time: "13:00", name: "Undecided Session", status: "maybe" },
      { days: -2, time: "14:00", name: "Late Session", status: "late" },
      { days: -1, time: "15:00", name: "Latest Session", status: "present" },
    ] as const;

    for (const item of past) {
      const { event } = await api.createEvent(mgr.token, mgr.clubId, {
        type: "training",
        name: item.name,
        date: offsetDaysISO(item.days),
        startTime: item.time,
        location: "Pitch",
      });
      if (item.status !== "unanswered") {
        await api.setAttendance(mgr.token, mgr.clubId, event.id, {
          playerId: player.id,
          status: item.status,
        });
      }
    }

    const { event: tomorrow } = await api.createEvent(mgr.token, mgr.clubId, {
      type: "training",
      name: "Tomorrow Confirmation",
      date: offsetDaysISO(1),
      startTime: "18:00",
      location: "Pitch",
    });
    await api.setAttendance(mgr.token, mgr.clubId, tomorrow.id, {
      playerId: player.id,
      status: "maybe",
    });

    await api.createEvent(mgr.token, mgr.clubId, {
      type: "training",
      name: "Friday Session",
      date: offsetDaysISO(4),
      startTime: "19:00",
      location: "Pitch",
    });

    await page.addInitScript(
      ([tKey, cKey, tVal, cVal]) => {
        localStorage.setItem(tKey, tVal);
        localStorage.setItem(cKey, cVal);
      },
      [TOKEN_KEY, CLUB_KEY, mgr.token, mgr.clubId],
    );

    await page.goto("/roster");
    const row = page.getByRole("row", { name: /Jordan Form/ });
    await expect(row.getByLabel("Absent")).toHaveText(["A", "A", "A"]);
    await expect(row.getByLabel("Present")).toHaveText(["S", "S"]);

    const login = await api.login({ email, password });
    await page.addInitScript(
      ([tKey, cKey, tVal, cVal]) => {
        localStorage.setItem(tKey, tVal);
        localStorage.setItem(cKey, cVal);
      },
      [TOKEN_KEY, CLUB_KEY, login.token, mgr.clubId],
    );
    await page.goto("/play");
    await expect(page.getByText("Please confirm the day before the event.")).toBeVisible();

    const friday = page.locator(".event-card").filter({ hasText: "Friday Session" });
    await friday.getByRole("button", { name: "RSVP" }).click();
    await page.getByRole("menuitemradio", { name: "Maybe" }).click();
    await expect(page.getByText("You replied Maybe for Friday Session.")).toBeVisible();

    await page.goto("/play/attendance");
    const silent = page.getByRole("row").filter({ hasText: formatEventWhen(offsetDaysISO(-6), "12:00") });
    await expect(silent.getByText("Absent")).toBeVisible();
    const undecided = page.getByRole("row").filter({ hasText: formatEventWhen(offsetDaysISO(-4), "13:00") });
    await expect(undecided.getByText("Absent")).toBeVisible();
    await expect(undecided.getByText("Maybe")).toHaveCount(0);
    const latest = page.getByRole("row").filter({ hasText: formatEventWhen(offsetDaysISO(-1), "15:00") });
    await expect(latest.getByText("Present")).toBeVisible();
    await expect(page.getByText("No reply")).toHaveCount(0);
  });
});
