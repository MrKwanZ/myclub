import type { Page } from "@playwright/test";

export class AuthPage {
  constructor(private readonly page: Page) {}

  async gotoLogin() {
    await this.page.goto("/login");
  }

  async login(email: string, password: string) {
    await this.page.getByLabel("Email").fill(email);
    await this.page.getByLabel("Password").fill(password);
    await this.page.getByRole("button", { name: "Sign in" }).click();
  }

  async gotoRegister() {
    await this.page.goto("/register");
  }

  async registerClub(input: {
    name: string;
    email: string;
    password: string;
    clubName: string;
    description?: string;
    goals?: string;
  }) {
    await this.page.getByLabel("Your name").fill(input.name);
    await this.page.getByRole("button", { name: "Next", exact: true }).click();

    await this.page.getByLabel("Email").fill(input.email);
    await this.page.getByRole("button", { name: "Next", exact: true }).click();

    await this.page.getByLabel("Password").fill(input.password);
    await this.page.getByRole("button", { name: "Next", exact: true }).click();

    await this.page.getByLabel("Club name").fill(input.clubName);
    await this.page.getByRole("button", { name: "Next", exact: true }).click();

    if (input.description) {
      await this.page.getByLabel("Description").fill(input.description);
    }
    await this.page.getByRole("button", { name: "Next", exact: true }).click();

    if (input.goals) {
      await this.page.getByLabel("Goals").fill(input.goals);
    }
    await this.page.getByRole("button", { name: "Next", exact: true }).click();

    await this.page.getByRole("button", { name: "Create club" }).click();
  }
}
