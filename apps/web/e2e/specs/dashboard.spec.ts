import { test, expect } from "../fixtures/test";
import { offsetDaysISO } from "../fixtures/api";
import { SEED } from "../fixtures/seed";

test.describe("Manager Dashboard", () => {
  test.use({ storageState: "e2e/.auth/manager.json" });

  test("Games tab shows the match title and colored scores, and the heading greets by time of day", async ({
    page,
    api,
  }) => {
    const login = await api.login({ email: SEED.manager.email, password: SEED.manager.password });
    const clubId = login.user.memberships.find((membership) => membership.club.name === SEED.manager.clubName)?.clubId;
    const title = `Title Fixture ${Date.now().toString().slice(-4)}`;
    await api.createEvent(login.token, clubId!, {
      type: "match",
      name: title,
      date: offsetDaysISO(6),
      startTime: "16:00",
      location: "North Pitch",
      opponent: "Title FC",
    });

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Alex Manager/ })).toBeVisible();

    const incoming = page.locator(".dash-list li").filter({ hasText: title });
    await expect(incoming.getByText(title)).toBeVisible();
    await expect(incoming.getByText(/North Pitch/)).toBeVisible();

    const past = page.locator(".dash-list li").filter({ hasText: "League Opener" });
    await expect(past.locator(".score-win")).toHaveText("3–1");
    await expect(past.getByText(/\bwin\b|\bloss\b|\bdraw\b/i)).toHaveCount(0);
    await expect(page.getByText("City Rovers")).toBeVisible();

    // Players tab
    await page.getByRole("tab", { name: "Players" }).click();
    await expect(page.getByText(SEED.player.name).first()).toBeVisible();
    await expect(page.getByText("Leo Keeper").first()).toBeVisible();
    await expect(page.getByText("Shoulder").first()).toBeVisible();

    // Finance tab
    await page.getByRole("tab", { name: "Finance" }).click();
    await expect(page.getByText("380.00")).toBeVisible();
    await expect(page.getByText("500.00")).toBeVisible();
    await expect(page.getByText("120.00")).toBeVisible();
  });
});
