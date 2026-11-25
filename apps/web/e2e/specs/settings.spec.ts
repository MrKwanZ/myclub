import { test, expect } from "../fixtures/test";
import { TOKEN_KEY, CLUB_KEY } from "../../lib/storage";

// 1x1 valid PNG
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test.describe("Club settings", () => {
  test("manager can update club details and upload logo", async ({ page, api }) => {
    const mgr = await api.bootstrapManagerClub("settings");
    await page.addInitScript(
      ([tKey, cKey, tVal, cVal]) => {
        localStorage.setItem(tKey, tVal);
        localStorage.setItem(cKey, cVal);
      },
      [TOKEN_KEY, CLUB_KEY, mgr.token, mgr.clubId],
    );

    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: /Settings|Club/i })).toBeVisible();

    const updatedName = `Updated ${mgr.clubName}`;
    await page.getByLabel("Name").fill(updatedName);
    await page.getByLabel("Description").fill("Updated club description");
    await page.getByLabel("Goals").fill("Win cup & league");

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "logo.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(/saved|updated/i).first()).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Name")).toHaveValue(updatedName);
    await expect(page.locator(`img[alt="${updatedName} logo"]`)).toBeVisible();
  });
});
