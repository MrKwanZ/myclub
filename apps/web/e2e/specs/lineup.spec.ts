import { offsetDaysISO, uniqueEmail } from "../fixtures/api";
import { expect, test, type Locator } from "../fixtures/test";
import { AuthPage } from "../pages/AuthPage";
import { ShellPage } from "../pages/ShellPage";

// Valid 2x2 red PNG image buffer for jersey upload testing
const RED_JERSEY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8AARIQB4////x8ACisF/V9l8r4AAAAASUVORK5CYII=",
  "base64",
);

async function togglePlayerOption(listbox: Locator, name: string) {
  const option = listbox.getByRole("option", { name, exact: true });
  await listbox.evaluate((el) => {
    el.scrollTop = 0;
    el.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  for (let step = 0; step < 14; step++) {
    await listbox.page().waitForTimeout(35);
    if ((await option.count()) > 0 && (await option.first().isVisible())) {
      await option.first().click({ timeout: 5_000 });
      return;
    }
    await listbox.evaluate((el, idx) => {
      el.scrollTop = (idx + 1) * 110;
      el.dispatchEvent(new Event("scroll", { bubbles: true }));
    }, step);
  }
  throw new Error(`Option "${name}" not visible in virtualized player ListBox`);
}

test.describe("Squad & Lineup management", () => {
  test("supports manager-only lineup board, jersey application, limits, dragging, image export, and matchday lineup modal", async ({
    page,
    api,
  }) => {
    test.setTimeout(45_000);

    const mgr = await api.bootstrapManagerClub("lineup");

    // Seed roster across all 4 positions (15 players total to test both position limits and 11-player limit)
    const rosterSpec = [
      { name: "GK One", position: "Goalkeeper", shirtNumber: 1 },
      { name: "GK Two", position: "Goalkeeper", shirtNumber: 12 },
      { name: "Def One", position: "Defender", shirtNumber: 2 },
      { name: "Def Two", position: "Defender", shirtNumber: 3 },
      { name: "Def Three", position: "Defender", shirtNumber: 4 },
      { name: "Def Four", position: "Defender", shirtNumber: 5 },
      { name: "Def Five", position: "Defender", shirtNumber: 6 },
      { name: "Def Six", position: "Defender", shirtNumber: 15 },
      { name: "Mid One", position: "Midfielder", shirtNumber: 7 },
      { name: "Mid Two", position: "Midfielder", shirtNumber: 8 },
      { name: "Mid Three", position: "Midfielder", shirtNumber: 10 },
      { name: "Fwd One", position: "Forward", shirtNumber: 9 },
      { name: "Fwd Two", position: "Forward", shirtNumber: 11 },
      { name: "Fwd Three", position: "Forward", shirtNumber: 14 },
      { name: "Fwd Four", position: "Forward", shirtNumber: 19 },
    ] as const;

    const createdPlayers: Record<string, string> = {};
    for (const p of rosterSpec) {
      const { player } = await api.createPlayer(mgr.token, mgr.clubId, {
        name: p.name,
        position: p.position,
        shirtNumber: p.shirtNumber,
        status: "active",
      });
      createdPlayers[p.name] = player.id;
    }

    const playerEmail = uniqueEmail("squadplayer");
    const playerPassword = "Password123!";
    await api.createPlayerAccount(mgr.token, mgr.clubId, createdPlayers["Mid One"], {
      email: playerEmail,
      password: playerPassword,
    });

    const matchDate = offsetDaysISO(2);
    const friendlyDate = offsetDaysISO(4);
    const { event: upcomingMatch } = await api.createEvent(mgr.token, mgr.clubId, {
      type: "match",
      name: "Cup Quarterfinal",
      opponent: "Northside FC",
      date: matchDate,
      startTime: "18:30",
      location: "Main Stadium",
    });
    await api.createEvent(mgr.token, mgr.clubId, {
      type: "friendly",
      name: "Sunday Scrimmage",
      opponent: "Harbor Rovers",
      date: friendlyDate,
      startTime: "15:00",
      location: "East Pitch",
    });
    await api.createEvent(mgr.token, mgr.clubId, {
      type: "training",
      name: "Midweek Drills",
      date: matchDate,
      startTime: "10:00",
      location: "Training Ground",
    });

    const auth = new AuthPage(page);
    const shell = new ShellPage(page);

    await auth.gotoLogin();
    await auth.login(mgr.email, mgr.password);
    await expect(page).toHaveURL(/\/dashboard/);

    // 1. Sidebar Lineup button visible for Manager
    const lineupNav = shell.navLink("Lineup");
    await expect(lineupNav).toBeVisible();

    // 2. Upload club jersey in Account first
    await page.getByTestId("account-link").click();
    await expect(page).toHaveURL(/\/account/);
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Upload Jersey" }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "home-kit.png",
      mimeType: "image/png",
      buffer: RED_JERSEY_PNG,
    });
    await expect(page.getByTestId("settings-jersey-list").locator("img")).toHaveCount(1);

    // 3. Open Lineup page
    await lineupNav.click();
    await expect(page).toHaveURL(/\/lineup/);
    await expect(page.getByRole("heading", { name: "Lineup" })).toBeVisible();

    const pitch = page.getByTestId("lineup-pitch");
    await expect(pitch).toBeVisible();
    const listbox = page.getByRole("listbox", { name: "Player" });
    await expect(listbox).toBeVisible();

    // 4. Select Goalkeeper and verify position & position limit error
    await togglePlayerOption(listbox, "GK One");
    const gkToken = page.getByTestId(`pitch-player-${createdPlayers["GK One"]}`);
    await expect(gkToken).toBeVisible();

    const pitchBox = (await pitch.boundingBox())!;
    const gkBox = (await gkToken.boundingBox())!;
    const gkCenterY = (gkBox.y + gkBox.height / 2 - pitchBox.y) / pitchBox.height;
    expect(gkCenterY).toBeGreaterThan(0.78);

    // Selecting a 2nd Goalkeeper shows position max error & highlights ListBox
    await togglePlayerOption(listbox, "GK Two");
    const errorMsg = page.locator('[data-slot="error-message"]');
    await expect(errorMsg).toHaveText("Only 1 player(s) allowed in Goalkeeper position");
    await expect(listbox).toHaveAttribute("data-invalid", "true");
    await expect(page.getByTestId(`pitch-player-${createdPlayers["GK Two"]}`)).toHaveCount(0);

    // Unselecting GK One removes them from pitch and clears error
    await togglePlayerOption(listbox, "GK One");
    await expect(gkToken).toHaveCount(0);
    await expect(errorMsg).toHaveCount(0);

    // Re-add GK One, plus 5 Defenders, verify left-to-right even placement and 6th Defender error
    await togglePlayerOption(listbox, "GK One");
    await togglePlayerOption(listbox, "Def One");
    await togglePlayerOption(listbox, "Def Two");
    const def1Box = (await page.getByTestId(`pitch-player-${createdPlayers["Def One"]}`).boundingBox())!;
    const def2Box = (await page.getByTestId(`pitch-player-${createdPlayers["Def Two"]}`).boundingBox())!;
    expect(def1Box.x).toBeLessThan(def2Box.x);

    await togglePlayerOption(listbox, "Def Three");
    await togglePlayerOption(listbox, "Def Four");
    await togglePlayerOption(listbox, "Def Five");
    await togglePlayerOption(listbox, "Def Six");
    await expect(errorMsg).toHaveText("Only 5 player(s) allowed in Defender position");

    // Add 3 Forwards and verify 4th Forward position max error
    await togglePlayerOption(listbox, "Fwd One");
    await togglePlayerOption(listbox, "Fwd Two");
    await togglePlayerOption(listbox, "Fwd Three");
    await togglePlayerOption(listbox, "Fwd Four");
    await expect(errorMsg).toHaveText("Only 3 player(s) allowed in Forward position");

    // Currently 1 GK + 5 DEF + 3 FWD = 9 players; add 2 Midfielders to reach 11, then try adding 12th player (Mid Three)
    await togglePlayerOption(listbox, "Mid One");
    await togglePlayerOption(listbox, "Mid Two");
    await expect(pitch.locator(".lineup-player-token")).toHaveCount(11);

    await togglePlayerOption(listbox, "Mid Three");
    await expect(errorMsg).toHaveText("Only 11 players allowed in the lineup");
    await expect(listbox).toHaveAttribute("data-invalid", "true");
    await expect(pitch.locator(".lineup-player-token")).toHaveCount(11);

    // 5. Apply uploaded jersey to players on the pitch
    const jerseyBtn = page.getByRole("button", { name: "Jersey 1" });
    await expect(jerseyBtn).toBeVisible();
    await jerseyBtn.click();
    await expect(pitch.locator(".lineup-player-jersey")).toHaveCount(11);

    // 6. Drag a player on the pitch with react-draggable and confirm coordinates change within bounds
    const fwdToken = page.getByTestId(`pitch-player-${createdPlayers["Fwd One"]}`);
    await pitch.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const beforeDrag = (await fwdToken.boundingBox())!;
    await page.mouse.move(beforeDrag.x + beforeDrag.width / 2, beforeDrag.y + beforeDrag.height / 2);
    await page.mouse.down();
    await page.mouse.move(beforeDrag.x + beforeDrag.width / 2 + 45, beforeDrag.y + beforeDrag.height / 2 + 35, {
      steps: 6,
    });
    await page.mouse.up();
    const afterDrag = (await fwdToken.boundingBox())!;
    expect(Math.hypot(afterDrag.x - beforeDrag.x, afterDrag.y - beforeDrag.y)).toBeGreaterThan(20);

    // 7. Save dropdown -> "As image" downloads PNG directly
    await page.getByRole("button", { name: "Save…" }).click();
    await expect(page.getByRole("menuitem", { name: "As matchday lineup" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "As image" })).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "As image" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("squad-lineup.png");

    // 8. Save dropdown -> "As matchday lineup" opens Modal with incoming matches & friendlies (not trainings)
    await page.getByRole("button", { name: "Save…" }).click();
    await page.getByRole("menuitem", { name: "As matchday lineup" }).click();
    const saveDialog = page.getByRole("dialog", { name: "Save as matchday lineup" });
    await expect(saveDialog).toBeVisible();

    await saveDialog.getByRole("button", { name: /Incoming match or friendly/i }).click();
    await expect(page.getByRole("option", { name: /Cup Quarterfinal/ })).toBeVisible();
    await expect(page.getByRole("option", { name: /Sunday Scrimmage/ })).toBeVisible();
    await expect(page.getByRole("option", { name: /Midweek Drills/ })).toHaveCount(0);
    await page.getByRole("option", { name: /Cup Quarterfinal/ }).click();

    await saveDialog.getByRole("button", { name: "Attach Lineup" }).click();
    await expect(saveDialog).toBeHidden();

    // 9. Clear button wipes out all players on the pitch
    await page.getByRole("button", { name: "Clear" }).click();
    await expect(pitch.locator(".lineup-player-token")).toHaveCount(0);

    // 10. Manager Calendar shows "Show lineup" button next to Edit button with Tooltip + Modal
    await page.goto(`/calendar?date=${matchDate}`);
    const managerShowBtn = page.getByTestId(`show-lineup-${upcomingMatch.id}`);
    await expect(managerShowBtn).toBeVisible();

    const editBtn = page.getByRole("button", { name: "Edit" }).first();
    const showBox = (await managerShowBtn.boundingBox())!;
    const editBox = (await editBtn.boundingBox())!;
    expect(showBox.x + showBox.width).toBeLessThanOrEqual(editBox.x + 2);

    await managerShowBtn.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.mouse.move(5, 5);
    await managerShowBtn.hover();
    await expect(page.getByRole("tooltip")).toContainText("Show lineup");

    await managerShowBtn.click();
    const previewModal = page.getByRole("dialog", { name: /Cup Quarterfinal/ });
    await expect(previewModal).toBeVisible();
    await expect(previewModal.locator(".lineup-player-token")).toHaveCount(11);
    await expect(previewModal.locator(".lineup-player-jersey")).toHaveCount(11);
    await page.keyboard.press("Escape");
    await expect(previewModal).toBeHidden();

    // 11. Player role cannot access /lineup or see Lineup nav, and CAN view "Show lineup" on Player Calendar
    await shell.signOut();
    await auth.login(playerEmail, playerPassword);
    await expect(page).toHaveURL(/\/play/);
    await expect(shell.navLink("Lineup")).toHaveCount(0);

    await page.goto("/lineup");
    await expect(page).toHaveURL(/\/play/);

    await page.goto(`/play/calendar?date=${matchDate}`);
    const playerShowBtn = page.getByTestId(`show-lineup-${upcomingMatch.id}`);
    await expect(playerShowBtn).toBeVisible();
    await playerShowBtn.click();
    const playerPreviewModal = page.getByRole("dialog", { name: /Cup Quarterfinal/ });
    await expect(playerPreviewModal).toBeVisible();
    await expect(playerPreviewModal.locator(".lineup-player-token")).toHaveCount(11);
  });
});
