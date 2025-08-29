import { test } from "@playwright/test";
import { runMapSmokeTest, setupSmokeTest } from "@carma-commons/e2e";

test.describe("potenzialflaechen-online smoke test", () => {
  let userData: any;

  test.beforeAll(async () => {
    // Load test data from fixtures
    userData = require("../fixtures/devSecrets.json");
    // });
  });

  test("map loads with key controls", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("textbox", { name: "WuNDa Benutzername" })
      .fill(userData.cheatingUser);
    await page
      .getByRole("textbox", { name: "Passwort" })
      .fill(userData.cheatingUser);
    await page
      .getByRole("button", { name: "Anmeldung" })
      .click({ force: true });

    await runMapSmokeTest(page, {
      fuzzySearchTimeout: 10000,
      checkZoomControl: true,
      checkFuzzySearch: true,
      checkApplicationMenu: true,
      checkInfoBox: true,
    });
  });
});
