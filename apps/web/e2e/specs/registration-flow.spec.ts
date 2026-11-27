import { expect, test } from "../fixtures/test";
import { uniqueEmail } from "../fixtures/api";

test.describe("Registration flow", () => {
  test("breadcrumb, confirm, and complete follow the four registration steps", async ({ page }) => {
    const email = uniqueEmail("flow");
    const clubName = `Flow FC ${Date.now().toString().slice(-4)}`;

    await page.goto("/register");
    await expect(page.getByRole("heading", { name: "Create your club" })).toBeVisible();
    const crumbs = page.getByRole("navigation", { name: "Registration steps" });
    const crumb = (name: string) => crumbs.locator(".breadcrumbs__link", { hasText: name });
    await expect(crumbs).toBeVisible();
    await expect(crumb("Personal")).toBeVisible();
    await expect(crumb("Club")).toHaveAttribute("aria-disabled", "true");
    await expect(crumb("Confirm")).toHaveAttribute("aria-disabled", "true");
    await expect(crumb("Complete")).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByLabel("Your name")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();

    await page.getByLabel("Your name").fill("Casey Manager");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("Password123!");
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await expect(page.getByLabel("Club name")).toBeVisible();
    const logoButton = page.getByRole("button", { name: "Upload Club Logo" });
    const jerseyButton = page.getByRole("button", { name: "Upload Jersey" });
    await expect(logoButton).toBeVisible();
    await expect(jerseyButton).toBeVisible();
    const logoBox = await logoButton.boundingBox();
    const jerseyBox = await jerseyButton.boundingBox();
    expect(logoBox && jerseyBox && jerseyBox.x > logoBox.x).toBe(true);
    expect(logoBox && jerseyBox && Math.abs(logoBox.y - jerseyBox.y) < 12).toBe(true);
    await expect(crumb("Personal")).not.toHaveAttribute("aria-disabled", "true");
    await expect(crumb("Confirm")).toHaveAttribute("aria-disabled", "true");

    await crumb("Personal").click();
    await expect(page.getByLabel("Your name")).toHaveValue("Casey Manager");
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await page.getByLabel("Club name").fill(clubName);
    await page.getByLabel("Description").fill("Sunday league side");
    await page.getByLabel("Goals").fill("Stay up");
    await page.getByRole("button", { name: "Next", exact: true }).click();

    await expect(page.getByText("Casey Manager")).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByText(clubName)).toBeVisible();
    await expect(page.getByText("Sunday league side")).toBeVisible();
    await expect(page.getByText("Stay up")).toBeVisible();
    await expect(crumb("Complete")).toHaveAttribute("aria-disabled", "true");

    let releaseRegister: () => void = () => {};
    const holdRegister = new Promise<void>((resolve) => {
      releaseRegister = resolve;
    });
    await page.route("**/auth/register", async (route) => {
      await holdRegister;
      await route.continue();
    });

    await page.getByRole("button", { name: "Create club" }).click();
    await expect(page.getByText("Creating your club…")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create club" })).toHaveCount(0);
    releaseRegister();

    await expect(page.getByText("Good news! You have created your club.")).toBeVisible();
    await expect(crumb("Personal")).not.toHaveAttribute("aria-disabled", "true");
    await expect(crumb("Club")).not.toHaveAttribute("aria-disabled", "true");
    await expect(crumb("Confirm")).not.toHaveAttribute("aria-disabled", "true");
    await page.getByRole("link", { name: "Start managing your club" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Casey Manager/ })).toBeVisible();
  });
});
