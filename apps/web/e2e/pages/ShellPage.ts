import { expect, type Page } from "@playwright/test";

export class ShellPage {
  constructor(private readonly page: Page) {}

  navLink(name: string) {
    return this.page.getByRole("navigation", { name: "Club" }).getByRole("button", { name });
  }

  async switchClub(clubName: string) {
    const switcher = this.page.getByTestId("club-switcher");
    await switcher.getByRole("button").click();
    await this.page.getByRole("menuitemradio", { name: clubName }).click().catch(async () => {
      await this.page.getByRole("option", { name: clubName }).click();
    });
  }

  async toggleTheme() {
    await this.page.getByTestId("theme-toggle").click();
  }

  async signOut() {
    await this.page.getByRole("button", { name: /Sign Out/i }).click();
    await expect(this.page).toHaveURL(/\/login/);
  }
}
