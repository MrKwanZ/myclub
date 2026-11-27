import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { test as setup } from "@playwright/test";
import { TEST_DATABASE_URL } from "../playwright.config";
import { e2eApi, offsetDaysISO } from "./fixtures/api";
import { SEED } from "./fixtures/seed";
import { CLUB_KEY, TOKEN_KEY } from "../lib/storage";

const AUTH_DIR = resolve(__dirname, ".auth");

async function saveLocalStorageState(
  page: import("@playwright/test").Page,
  token: string,
  clubId: string,
  outFile: string,
) {
  await page.goto("/login");
  await page.evaluate(
    ([tKey, cKey, tVal, cVal]) => {
      localStorage.setItem(tKey, tVal);
      localStorage.setItem(cKey, cVal);
    },
    [TOKEN_KEY, CLUB_KEY, token, clubId],
  );
  await page.context().storageState({ path: resolve(AUTH_DIR, outFile) });
}

setup("seed baseline accounts and save storageState", async ({ browser }) => {
  execFileSync("npx", ["tsx", "src/adminSeedCli.ts"], {
    cwd: resolve(__dirname, "../../api"),
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });

  // 1. Register & login baseline manager
  await e2eApi.register({
    email: SEED.manager.email,
    name: SEED.manager.name,
    password: SEED.manager.password,
  });
  const mgrLogin = await e2eApi.login({
    email: SEED.manager.email,
    password: SEED.manager.password,
  });
  const { club: baselineClub } = await e2eApi.createClub(mgrLogin.token, {
    name: SEED.manager.clubName,
    description: "Baseline E2E club",
    goals: "Top 3 finish",
  });

  // 2. Add baseline players (active + injured) and link player@e2e.test
  const { player: sam } = await e2eApi.createPlayer(mgrLogin.token, baselineClub.id, {
    name: SEED.player.name,
    position: "Forward",
    shirtNumber: 9,
    contact: "555-0109",
    status: "active",
    goals: 5,
    assists: 2,
  });
  await e2eApi.createPlayerAccount(mgrLogin.token, baselineClub.id, sam.id, {
    email: SEED.player.email,
    password: SEED.player.password,
  });
  await e2eApi.createPlayer(mgrLogin.token, baselineClub.id, {
    name: "Leo Keeper",
    position: "Goalkeeper",
    shirtNumber: 1,
    status: "injured",
    injuryArea: "Shoulder",
    expectedReturnDate: offsetDaysISO(14),
    goals: 0,
    assists: 1,
  });

  // 3. Seed baseline events & transactions in FC Baseline
  await e2eApi.createEvent(mgrLogin.token, baselineClub.id, {
    type: "training",
    name: "Evening Tactical Session",
    date: offsetDaysISO(2),
    startTime: "19:00",
    location: "Pitch A",
    notes: "Bring bibs",
  });
  await e2eApi.createEvent(mgrLogin.token, baselineClub.id, {
    type: "match",
    name: "League Opener",
    date: offsetDaysISO(-3),
    startTime: "15:00",
    location: "Home Ground",
    opponent: "City Rovers",
    scoreFor: 3,
    scoreAgainst: 1,
  });
  await e2eApi.createTransaction(mgrLogin.token, baselineClub.id, {
    type: "income",
    amount: 500,
    date: offsetDaysISO(-2),
    item: "Monthly Dues",
  });
  await e2eApi.createTransaction(mgrLogin.token, baselineClub.id, {
    type: "expense",
    amount: 120,
    date: offsetDaysISO(-1),
    item: "Match Balls",
  });

  // 4. Multi-club user: manages Alpha Managed FC, plays for Beta Played United
  await e2eApi.register({
    email: SEED.multi.email,
    name: SEED.multi.name,
    password: SEED.multi.password,
  });
  const multiLogin = await e2eApi.login({
    email: SEED.multi.email,
    password: SEED.multi.password,
  });
  const { club: alphaClub } = await e2eApi.createClub(multiLogin.token, {
    name: SEED.multi.managedClubName,
  });
  const { club: betaClub } = await e2eApi.createClub(mgrLogin.token, {
    name: SEED.multi.playedClubName,
  });
  const { player: multiAsPlayer } = await e2eApi.createPlayer(mgrLogin.token, betaClub.id, {
    name: SEED.multi.name,
    position: "Midfielder",
    shirtNumber: 8,
    status: "active",
  });
  await e2eApi.createPlayerAccount(mgrLogin.token, betaClub.id, multiAsPlayer.id, {
    email: SEED.multi.email,
  });
  await e2eApi.createEvent(mgrLogin.token, betaClub.id, {
    type: "training",
    name: "Beta Midweek Training",
    date: offsetDaysISO(3),
    startTime: "18:30",
    location: "Beta Field",
  });

  // 5. Save storageState files
  const playerLogin = await e2eApi.login({
    email: SEED.player.email,
    password: SEED.player.password,
  });

  const mgrContext = await browser.newContext();
  const mgrPage = await mgrContext.newPage();
  await saveLocalStorageState(mgrPage, mgrLogin.token, baselineClub.id, "manager.json");
  await mgrContext.close();

  const playerContext = await browser.newContext();
  const playerPage = await playerContext.newPage();
  await saveLocalStorageState(playerPage, playerLogin.token, baselineClub.id, "player.json");
  await playerContext.close();

  const multiContext = await browser.newContext();
  const multiPage = await multiContext.newPage();
  await saveLocalStorageState(multiPage, multiLogin.token, alphaClub.id, "multi-club.json");
  await multiContext.close();

  writeFileSync(
    resolve(AUTH_DIR, "seed-meta.json"),
    JSON.stringify(
      {
        baselineClubId: baselineClub.id,
        alphaClubId: alphaClub.id,
        betaClubId: betaClub.id,
      },
      null,
      2,
    ),
  );
});
