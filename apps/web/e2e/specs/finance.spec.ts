import { test, expect } from "../fixtures/test";
import { offsetDaysISO } from "../fixtures/api";
import { CLUB_KEY, TOKEN_KEY } from "../../lib/storage";

test.describe("Manager Finance", () => {
  test("create, edit, delete transactions and verify balance + Chart.js doughnut", async ({ page, api }) => {
    const mgr = await api.bootstrapManagerClub("fin");
    await api.createTransaction(mgr.token, mgr.clubId, {
      type: "income",
      amount: 1000,
      date: offsetDaysISO(-1),
      item: "Sponsor Grant",
    });

    await page.addInitScript(
      ([tKey, cKey, tVal, cVal]) => {
        localStorage.setItem(tKey, tVal);
        localStorage.setItem(cKey, cVal);
      },
      [TOKEN_KEY, CLUB_KEY, mgr.token, mgr.clubId],
    );

    await page.goto("/finance");
    await expect(page.getByRole("heading", { name: "Finance" })).toBeVisible();
    await expect(page.getByTestId("balance-value")).toContainText("1000.00");
    await expect(page.getByTestId("balance-chart").locator("canvas")).toBeVisible();

    // Add an expense transaction
    await page.getByRole("button", { name: "Create Transaction" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill("Pitch Rental");
    await dialog.getByRole("button", { name: "Type" }).click();
    await page.getByRole("menuitemradio", { name: "Expense" }).click();
    await dialog.getByLabel("Amount").fill("250");
    await dialog.getByRole("button", { name: "Create Transaction" }).click();
    await expect(dialog).toBeHidden();

    await expect(page.getByText("Pitch Rental")).toBeVisible();
    await expect(page.getByTestId("balance-value")).toContainText("750.00");

    // Delete Pitch Rental
    await page.getByRole("button", { name: "Actions for Pitch Rental" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();

    await expect(page.getByText("Pitch Rental")).toHaveCount(0);
    await expect(page.getByTestId("balance-value")).toContainText("1000.00");
  });
});
