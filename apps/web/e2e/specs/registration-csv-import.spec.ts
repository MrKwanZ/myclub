import { expect, test } from "../fixtures/test";
import { uniqueEmail } from "../fixtures/api";

const rosterCsv = "Player,Position,Shirt No.,Nickname\nImport Striker,Forward,9,Ace\n";
const financeCsv = "Date,Type,Item,Amount,Notes\n2026-12-01,income,Kit fund,25.00,Subs\n";
const eventsCsv = "Event Name,Type,Date,Start Time,Location,Opponent\nDerby Day,match,2026-12-15,18:30,City Pitch,Rivals FC\n";

function csvFile(name: string, contents: string) {
  return { name, mimeType: "text/csv", buffer: Buffer.from(contents) };
}

test.describe("Registration CSV import", () => {
  test("checkboxes sit below goals and unchecked imports are skipped", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Your name").fill("Casey Manager");
    await page.getByLabel("Email").fill(uniqueEmail("csv-skip"));
    await page.getByLabel("Password").fill("Password123!");
    await page.getByRole("button", { name: "Next", exact: true }).click();

    const goals = page.getByLabel("Goals");
    const roster = page.getByRole("checkbox", { name: "I have a club roster" });
    const finance = page.getByRole("checkbox", { name: "I have a club financial table" });
    const events = page.getByRole("checkbox", { name: "I have a club event schedule" });
    await expect(roster).toBeVisible();
    await expect(finance).toBeVisible();
    await expect(events).toBeVisible();
    const goalsBox = await goals.boundingBox();
    const rosterBox = await roster.boundingBox();
    expect(goalsBox && rosterBox && rosterBox.y > goalsBox.y).toBe(true);

    await page.getByRole("textbox", { name: "Club name" }).fill("Skip FC");
    await page.getByText("I have a club roster", { exact: true }).click();
    await expect(roster).toBeChecked();
    await expect(page.getByRole("button", { name: "Upload roster CSV" })).toBeVisible();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByText("Upload a roster CSV.")).toBeVisible();

    await page.getByText("I have a club roster", { exact: true }).click();
    await expect(roster).not.toBeChecked();
    await expect(page.getByRole("button", { name: "Upload roster CSV" })).toHaveCount(0);
    await page.getByRole("button", { name: "Next", exact: true }).click();

    const crumbs = page.getByRole("navigation", { name: "Registration steps" });
    await expect(crumbs.getByText("Roster", { exact: true })).toHaveCount(0);
    await expect(crumbs.getByText("Finance", { exact: true })).toHaveCount(0);
    await expect(crumbs.getByText("Events", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Skip FC")).toBeVisible();
  });

  test("imports roster, finance, and events only after create club", async ({ page }) => {
    const importCalls: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && /\/clubs\/[^/]+\/import$/.test(request.url())) importCalls.push(request.url());
    });

    const email = uniqueEmail("csv-import");
    const clubName = `Import FC ${Date.now().toString().slice(-4)}`;
    await page.goto("/register");
    await page.getByLabel("Your name").fill("Casey Manager");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("Password123!");
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await page.getByLabel("Club name").fill(clubName);
    await page.getByText("I have a club roster", { exact: true }).click();
    await page.getByText("I have a club financial table", { exact: true }).click();
    await page.getByText("I have a club event schedule", { exact: true }).click();

    await page.getByTestId("register-roster-csv-input").setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not,a,csv\n"),
    });
    await expect(page.getByText("Upload a CSV file.")).toBeVisible();
    await expect(page.getByText("notes.txt")).toHaveCount(0);

    await page.getByTestId("register-roster-csv-input").setInputFiles(csvFile("roster-bad.csv", "Player,Position\n,Forward\n"));
    await expect(page.getByText("roster-bad.csv")).toBeVisible();
    await page.getByTestId("register-finance-csv-input").setInputFiles(csvFile("finance-import.csv", financeCsv));
    await page.getByTestId("register-events-csv-input").setInputFiles(csvFile("events-import.csv", eventsCsv));
    await page.getByRole("button", { name: "Next", exact: true }).click();

    const crumbs = page.getByRole("navigation", { name: "Registration steps" });
    await expect(crumbs.getByText("Roster", { exact: true })).toBeVisible();
    await expect(crumbs.getByText("Finance", { exact: true })).toBeVisible();
    await expect(crumbs.getByText("Events", { exact: true })).toBeVisible();
    await expect(page.getByText("Below is the data read from your file. Check if the data is correct.")).toBeVisible();
    await expect(page.getByText("Name is required.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();

    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByTestId("register-roster-csv-input").setInputFiles(csvFile("roster-import.csv", rosterCsv));
    await expect(page.getByText("roster-import.csv")).toBeVisible();
    await page.getByRole("button", { name: "Next", exact: true }).click();

    const rosterTable = page.getByRole("grid", { name: "Roster import" });
    await expect(rosterTable).toContainText("Import Striker");
    await expect(rosterTable).toContainText("Forward");
    await expect(rosterTable).toContainText("9");
    await expect(rosterTable).not.toContainText("Ace");
    await expect(page.getByRole("columnheader", { name: "Contact" })).toBeVisible();
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await expect(page.getByRole("grid", { name: "Finance import" })).toContainText("Kit fund");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("grid", { name: "Events import" })).toContainText("Derby Day");
    await expect(page.getByRole("grid", { name: "Events import" })).toContainText("Rivals FC");
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await expect(page.getByText("roster-import.csv")).toBeVisible();
    await expect(page.getByText("finance-import.csv")).toBeVisible();
    await expect(page.getByText("events-import.csv")).toBeVisible();
    expect(importCalls).toEqual([]);

    await page.getByRole("button", { name: "Create club" }).click();
    await expect(page.getByText("Good news! You have created your club.")).toBeVisible();
    expect(importCalls).toHaveLength(1);

    await page.getByRole("link", { name: "Start managing your club" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto("/roster");
    await expect(page.getByRole("link", { name: "Import Striker" })).toBeVisible();
    await page.goto("/finance");
    await expect(page.getByRole("grid", { name: "Transactions" }).or(page.getByText("Kit fund")).first()).toBeVisible();
    await expect(page.getByText("Kit fund")).toBeVisible();
    await page.goto("/matches");
    await expect(page.getByLabel("Opponent")).toHaveValue("Rivals FC");
    await page.goto("/calendar?date=2026-12-15");
    await expect(page.getByRole("heading", { name: "Derby Day" })).toBeVisible();
  });
});
