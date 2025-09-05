import { test, expect } from "@playwright/test";
import { runMapSmokeTest, setupSmokeTest, setupAllMocks } from "@carma-commons/e2e";

test.describe("potenzialflaechen-online smoke test", () => {
  let userData: any;

  test.beforeAll(async () => {
    userData = require("../fixtures/devSecrets.json");
  });

  test("map loads with key controls", async ({ context, page }) => {
    await setupAllMocks(context, ["bezirke", "quartiere", "kitas", "pois"]);
    
    // Mock map style JSON files
    const mockStyleJson = {
      version: 8,
      name: "Mock Style",
      sources: {},
      layers: []
    };
    
    await context.route('https://omt.map-hosting.de/styles/cismet-light/style.json', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockStyleJson),
      })
    );
    
    await context.route('https://omt.map-hosting.de/styles/osm-bright-grey/style.json', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockStyleJson),
      })
    );
    
    await context.route('https://omt.map-hosting.de/styles/brunnen/style.json', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockStyleJson),
      })
    );
    
    await context.route('https://omt.map-hosting.de/styles/kanal/style.json', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockStyleJson),
      })
    );
    
    await context.route('https://omt.map-hosting.de/styles/gewaesser/style.json', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockStyleJson),
      })
    );

    await context.route(' https://potenzialflaechen-online-api.cismet.de/actions/WUNDA_BLAU.dataAquisition/tasks?resultingInstanceType=result', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: "[]",
      })
    );

    await context.route("https://offline-data.cismet.de/offline-data/*", route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: "[]",
      })
    );
    
    await page.goto("/");
    await page.addStyleTag({
      content: `
      * { transition: none !important; animation: none !important; }
      .collapse { display: block !important; height: auto !important; }
    `,
    });

    const modal = page.locator(".modal-content");
    await expect(modal).toBeVisible();
    await page
      .getByRole("textbox", { name: "WuNDa Benutzername" })
      .fill(userData.cheatingUser);
    await page
      .getByRole("textbox", { name: "Passwort" })
      .fill(userData.cheatingPassword);
    await page.getByRole("button", { name: "Anmeldung" }).click();

    await expect(modal).toHaveCount(0);

    await runMapSmokeTest(page, {
      fuzzySearchTimeout: 10000,
      checkZoomControl: true,
      checkFuzzySearch: true,
      checkApplicationMenu: true,
      checkInfoBox: true,
    });
  });
});
