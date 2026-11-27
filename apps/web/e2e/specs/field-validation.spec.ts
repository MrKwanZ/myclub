import { test, expect, type Locator } from "../fixtures/test";
import { TOKEN_KEY, CLUB_KEY } from "../../lib/storage";

async function expectFieldErrorBelow(input: Locator, error: Locator) {
  await expect(error).toBeVisible();
  const inputBox = await input.boundingBox();
  const errorBox = await error.boundingBox();
  expect(inputBox).not.toBeNull();
  expect(errorBox).not.toBeNull();
  if (inputBox && errorBox) {
    expect(errorBox.y).toBeGreaterThanOrEqual(inputBox.y + inputBox.height - 2);
  }
}

test.describe("Field validation and FieldError highlighting", () => {
  test("login and register highlight invalid fields on blur and clear when fixed", async ({ page }) => {
    await page.goto("/login");

    const emailInput = page.getByLabel("Email");
    await emailInput.fill("not-an-email");
    await emailInput.blur();
    const emailError = page.getByText("Enter a valid email.");
    await expect(emailInput).toHaveAttribute("aria-invalid", "true");
    await expectFieldErrorBelow(emailInput, emailError);

    await emailInput.fill("manager@example.com");
    await expect(emailError).toBeHidden();

    const passwordInput = page.getByLabel("Password");
    await passwordInput.focus();
    await passwordInput.blur();
    const passwordError = page.getByText("Password is required.");
    await expect(passwordInput).toHaveAttribute("aria-invalid", "true");
    await expectFieldErrorBelow(passwordInput, passwordError);

    await page.goto("/register");
    const nameInput = page.getByLabel("Your name");
    await nameInput.focus();
    await nameInput.blur();
    const nameError = page.getByText("Name is required.");
    await expect(nameInput).toHaveAttribute("aria-invalid", "true");
    await expectFieldErrorBelow(nameInput, nameError);
  });

  test("settings, roster, calendar, finance, and matches highlight invalid fields on blur", async ({ page, api }) => {
    const mgr = await api.bootstrapManagerClub("validation");
    const todayISO = new Date().toISOString().slice(0, 10);
    await api.createEvent(mgr.token, mgr.clubId, {
      name: "League Match",
      type: "match",
      date: todayISO,
      startTime: "18:00",
      location: "Main Pitch",
      opponent: "Rivals FC",
    });

    await page.addInitScript(
      ([tKey, cKey, tVal, cVal]) => {
        localStorage.setItem(tKey, tVal);
        localStorage.setItem(cKey, cVal);
      },
      [TOKEN_KEY, CLUB_KEY, mgr.token, mgr.clubId],
    );

    // Account
    await page.goto("/account");
    await page.getByRole("button", { name: "Club" }).click();
    const clubNameInput = page.getByLabel("Club name");
    await expect(clubNameInput).toHaveValue(mgr.clubName);
    await clubNameInput.fill("");
    await clubNameInput.blur();
    const clubNameError = page.getByText("Club name is required.");
    await expect(clubNameInput).toHaveAttribute("aria-invalid", "true");
    await expectFieldErrorBelow(clubNameInput, clubNameError);

    // Roster
    await page.goto("/roster");
    await page.getByRole("button", { name: "Create Player" }).click();
    const modal = page.getByRole("dialog");
    const playerNameInput = modal.getByLabel("Name");
    await playerNameInput.focus();
    await playerNameInput.blur();
    await expect(playerNameInput).toHaveAttribute("aria-invalid", "true");
    await expectFieldErrorBelow(playerNameInput, modal.getByText("Name is required."));

    const shirtInput = modal.getByLabel("Shirt number");
    await shirtInput.fill("120");
    await shirtInput.blur();
    await expect(shirtInput).toHaveAttribute("aria-invalid", "true");
    await expectFieldErrorBelow(shirtInput, modal.getByText("Shirt number must be from 0 to 99."));

    // Calendar
    await page.goto("/calendar");
    await page.getByRole("button", { name: "New Event" }).click();
    const eventModal = page.getByRole("dialog");
    const eventNameInput = eventModal.getByLabel("Event Name");
    await eventNameInput.focus();
    await eventNameInput.blur();
    await expect(eventNameInput).toHaveAttribute("aria-invalid", "true");
    await expectFieldErrorBelow(eventNameInput, eventModal.getByText("Event name is required."));

    // Finance
    await page.goto("/finance");
    await page.getByRole("button", { name: "Create Transaction" }).click();
    const txModal = page.getByRole("dialog");
    const txAmountInput = txModal.getByLabel("Amount");
    await txAmountInput.fill("0");
    await txAmountInput.blur();
    await expect(txAmountInput).toHaveAttribute("aria-invalid", "true");
    await expectFieldErrorBelow(txAmountInput, txModal.getByText("Amount must be greater than zero."));

    // Matches
    await page.goto("/matches");
    const opponentInput = page.getByLabel("Opponent");
    await opponentInput.fill("");
    await opponentInput.blur();
    await expect(opponentInput).toHaveAttribute("aria-invalid", "true");
    await expectFieldErrorBelow(opponentInput, page.getByText("Opponent is required."));
  });
});
