import { defineConfig, devices } from "@playwright/test";

export const TEST_API_URL = "http://localhost:4001";
export const TEST_WEB_URL = "http://localhost:3001";
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://myclub:myclub_local@localhost:5432/myclub_test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: TEST_WEB_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium-desktop",
      dependencies: ["setup"],
      testDir: "./e2e/specs",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "chromium-mobile",
      dependencies: ["setup"],
      testDir: "./e2e/specs",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: [
    {
      command:
        "npx prisma migrate deploy --schema apps/api/prisma/schema.prisma && npm run start -w @myclub/api",
      cwd: "../..",
      url: `${TEST_API_URL}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PORT: "4001",
        DATABASE_URL: TEST_DATABASE_URL,
        JWT_SECRET: "myclub-e2e-test-secret",
      },
    },
    {
      command: "npx next dev --port 3001",
      cwd: ".",
      url: TEST_WEB_URL,
      reuseExistingServer: false,
      timeout: 90_000,
      env: {
        NEXT_DIST_DIR: ".next-e2e",
        NEXT_PUBLIC_API_URL: TEST_API_URL,
        NEXT_PUBLIC_SITE_URL: TEST_WEB_URL,
      },
    },
  ],
});
