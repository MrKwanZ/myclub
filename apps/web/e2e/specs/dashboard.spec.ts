import { test, expect } from "../fixtures/test";
import { SEED } from "../fixtures/seed";

test.describe("Manager Dashboard", () => {
  test.use({ storageState: "e2e/.auth/manager.json" });

  test("Games, Players, and Finance tabs render seeded club metrics and Win/Loss chart", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    // Games tab
    await expect(page.getByText("City Rovers")).toBeVisible();
    await expect(page.getByTestId("win-loss-chart").locator("canvas")).toBeVisible();

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
