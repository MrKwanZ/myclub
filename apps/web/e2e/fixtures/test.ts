import { test as base, expect } from "@playwright/test";
import { e2eApi } from "./api";

type Fixtures = {
  api: typeof e2eApi;
};

export const test = base.extend<Fixtures>({
  api: async ({}, use) => {
    await use(e2eApi);
  },
  page: async ({ page }, use) => {
    const pageErrors: string[] = [];
    const serverErrors: string[] = [];

    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    page.on("response", (res) => {
      if (res.status() >= 500) {
        serverErrors.push(`${res.status()} ${res.url()}`);
      }
    });

    await use(page);

    expect(pageErrors, `Uncaught page errors: ${pageErrors.join("; ")}`).toEqual([]);
    expect(serverErrors, `5xx server responses: ${serverErrors.join("; ")}`).toEqual([]);
  },
});

export { expect };
