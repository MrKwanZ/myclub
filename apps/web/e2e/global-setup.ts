import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://myclub:myclub_local@localhost:5432/myclub_test";

export default async function globalSetup() {
  const apiDir = resolve(__dirname, "../../api");
  mkdirSync(resolve(__dirname, ".auth"), { recursive: true });

  const env = {
    ...process.env,
    DATABASE_URL: TEST_DATABASE_URL,
  };

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: apiDir,
    stdio: "inherit",
    env,
  });

  execFileSync(
    "npx",
    ["prisma", "db", "execute", "--url", TEST_DATABASE_URL, "--stdin"],
    {
      cwd: apiDir,
      input:
        'TRUNCATE TABLE "StatusNoticeRead", "StatusNotice", "Attendance", "Transaction", "Photo", "MatchDocument", "Tactic", "Event", "Player", "Membership", "Club", "User" RESTART IDENTITY CASCADE;',
      stdio: ["pipe", "inherit", "inherit"],
      env,
    },
  );
}
