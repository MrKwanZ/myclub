import { test, expect } from "../fixtures/test";
import { AuthPage } from "../pages/AuthPage";
import { TOKEN_KEY, CLUB_KEY } from "../../lib/storage";
import { offsetDaysISO, uniqueEmail } from "../fixtures/api";
import type { Page } from "@playwright/test";

// 1x1 valid PNG
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const ROSTER_CSV = "Player,Shirt No.,Nickname\nAlex Keeper,1,AK\n";

async function openAs(page: Page, token: string, clubId: string, path = "/account") {
  await page.addInitScript(
    ([tKey, cKey, tVal, cVal]) => {
      localStorage.setItem(tKey, tVal);
      localStorage.setItem(cKey, cVal);
    },
    [TOKEN_KEY, CLUB_KEY, token, clubId] as const,
  );
  await page.goto(path);
}

test.describe("Club settings", () => {
  test("account button shows the signed-in user and opens Account", async ({ page, api }) => {
    const mgr = await api.bootstrapManagerClub("account");
    await openAs(page, mgr.token, mgr.clubId, "/dashboard");
    const accountLink = page.getByTestId("account-link");
    await expect(accountLink).toBeVisible();
    await expect(accountLink.getByText("AM", { exact: true })).toBeVisible();
    await expect(accountLink.getByText("account Manager")).toBeVisible();
    await expect(accountLink.getByText("Manager", { exact: true })).toBeVisible();
    await accountLink.click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("heading", { name: "Account", level: 1 })).toBeVisible();
  });

  test("manager can update club details and upload logo", async ({ page, api }) => {
    const mgr = await api.bootstrapManagerClub("settings");
    await openAs(page, mgr.token, mgr.clubId);
    await expect(page.getByRole("heading", { name: "Account", level: 1 })).toBeVisible();
    const surface = page.getByTestId("account-accordion-surface");
    const main = page.locator("main.main");
    const surfaceBox = await surface.boundingBox();
    const mainBox = await main.boundingBox();
    expect(surfaceBox && mainBox).toBeTruthy();
    if (surfaceBox && mainBox) {
      expect(surfaceBox.width / mainBox.width).toBeCloseTo(0.8, 1);
      expect(surfaceBox.x + surfaceBox.width / 2).toBeCloseTo(mainBox.x + mainBox.width / 2, 0);
    }
    await expect(page.getByRole("heading", { name: "settings Manager", level: 2 })).toBeVisible();
    await expect(page.locator(".settings-profile").getByText("SM", { exact: true })).toBeVisible();

    const accountNav = page.getByRole("navigation", { name: "Account" });
    const accountLink = accountNav.getByTestId("account-link");
    await expect(accountLink).toBeVisible();
    await expect(accountLink.getByText("SM", { exact: true })).toBeVisible();
    await expect(accountLink.getByText("settings Manager")).toBeVisible();
    await expect(accountLink.getByText("Manager", { exact: true })).toBeVisible();
    await expect(accountNav.getByRole("button", { name: "Sign Out" })).toBeVisible();

    await page.getByRole("button", { name: "Club" }).click();
    const club = page.getByTestId("settings-club");
    const logoButton = club.getByRole("button", { name: "Upload Club Logo" });
    const jerseyButton = club.getByRole("button", { name: "Upload Jersey" });
    const logoBox = await logoButton.boundingBox();
    const jerseyBox = await jerseyButton.boundingBox();
    expect(logoBox && jerseyBox && jerseyBox.x > logoBox.x).toBe(true);
    expect(logoBox && jerseyBox && Math.abs(logoBox.y - jerseyBox.y) < 12).toBe(true);

    const updatedName = `Updated ${mgr.clubName}`;
    await club.getByLabel("Club name").fill(updatedName);
    await club.getByLabel("Description").fill("Updated club description");
    await club.getByLabel("Goals").fill("Win cup & league");

    await page.getByTestId("club-logo-input").setInputFiles({
      name: "logo.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });

    await club.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(/saved|updated/i).first()).toBeVisible();

    await page.reload();
    await page.getByRole("button", { name: "Club" }).click();
    await expect(club.getByLabel("Club name")).toHaveValue(updatedName);
    await expect(page.getByTestId("settings-media-row").locator(`img[alt="${updatedName} logo"]`)).toBeVisible();
  });

  test("avatar accepts a profile photo and password errors stay on the fields", async ({ page, api }) => {
    const mgr = await api.bootstrapManagerClub("profile");
    await openAs(page, mgr.token, mgr.clubId);

    await page.getByTestId("settings-avatar-input").setInputFiles({
      name: "avatar.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });
    await expect(page.getByRole("img", { name: "profile Manager photo" })).toBeVisible();

    await page.getByRole("button", { name: "Password" }).click();
    const password = page.getByTestId("settings-password");
    await password.getByLabel("New password").fill("short");
    await password.getByRole("button", { name: "Save", exact: true }).click();
    await expect(password.getByText("Current password is required.")).toBeVisible();
    await expect(password.getByText("Password must be at least 8 characters.")).toBeVisible();
    await expect(password.getByText("Confirm password is required.")).toBeVisible();

    await password.getByLabel("Current password").fill("not-the-password");
    await password.getByLabel("New password").fill("Password1234!");
    await password.getByLabel("Confirm password").fill("Password9999!");
    await password.getByRole("button", { name: "Save", exact: true }).click();
    await expect(password.getByText("New and confirm passwords must match.")).toBeVisible();

    await password.getByLabel("Confirm password").fill("Password1234!");
    await password.getByRole("button", { name: "Save", exact: true }).click();
    await expect(password.getByText("Incorrect password")).toBeVisible();

    await password.getByLabel("Current password").fill(mgr.password);
    await password.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saved successfully").first()).toBeVisible();

    const again = await api.login({ email: mgr.email, password: "Password1234!" });
    expect(again.token).toBeTruthy();
    await expect(api.login({ email: mgr.email, password: mgr.password })).rejects.toThrow(/Incorrect password/);
  });

  test("csv import waits for confirm and club save does not import again", async ({ page, api }) => {
    const mgr = await api.bootstrapManagerClub("csvset");
    await openAs(page, mgr.token, mgr.clubId);
    await page.getByRole("button", { name: "Data" }).click();

    await page.getByTestId("settings-roster-csv").setInputFiles({
      name: "roster.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(ROSTER_CSV),
    });
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Below is the data read from your file. Check if the data is correct.")).toBeVisible();
    await expect(dialog.getByRole("rowheader", { name: "Alex Keeper" })).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();

    await page.goto("/roster");
    await expect(page.getByText("Alex Keeper")).toHaveCount(0);

    await page.goto("/account");
    await page.getByRole("button", { name: "Data" }).click();
    await page.getByTestId("settings-roster-csv").setInputFiles({
      name: "roster.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(ROSTER_CSV),
    });
    await page.getByRole("button", { name: "Confirm" }).click();
    await page.getByText("Roster data uploaded successfully. Click to view.").click();
    await expect(page).toHaveURL(/\/roster/);
    await expect(page.getByText("Alex Keeper")).toBeVisible();

    await page.goto("/account");
    await page.getByRole("button", { name: "Club" }).click();
    await expect(page.getByLabel("Club name")).not.toHaveValue("");
    await page.getByTestId("settings-club").getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saved successfully").first()).toBeVisible();
    await page.goto("/roster");
    await expect(page.getByText("Alex Keeper")).toHaveCount(1);
  });

  test("a player under the attendance threshold is warned on the next login", async ({ page, api }) => {
    const mgr = await api.bootstrapManagerClub("alert");
    await api.createEvent(mgr.token, mgr.clubId, {
      name: "Alert Training",
      type: "training",
      date: offsetDaysISO(1),
      startTime: "18:00",
      location: "Main Pitch",
    });
    const { player } = await api.createPlayer(mgr.token, mgr.clubId, { name: "Low Attendance" });
    const email = uniqueEmail("low");
    const password = "Password123!";
    await api.createPlayerAccount(mgr.token, mgr.clubId, player.id, { email, password });
    await api.updateClub(mgr.token, mgr.clubId, { attendanceAlertEnabled: true, attendanceAlertPercent: 80 });

    const auth = new AuthPage(page);
    await auth.gotoLogin();
    await auth.login(email, password);
    await expect(page.getByText("Your attendance is 0%, which is below the 80% set by your club.")).toBeVisible();
  });
});
