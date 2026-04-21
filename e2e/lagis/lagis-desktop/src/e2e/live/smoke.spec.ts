import { test, expect } from "@playwright/test";
import { setupAllMocks, mockOMTMapHosting } from "@carma-commons/e2e";
import {
  responseWithTwoOffices,
  gemarkung,
} from "../../fixtures/mock-responses";

test.describe("lagis smoke test", () => {
  test("main page show map, menu, combo boxes and selected offices after authorization", async ({
    page,
    context,
  }) => {
    await setupAllMocks(context);
    await mockOMTMapHosting(context);

    // Mock icons8 images
    await context.route("https://img.icons8.com/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          "base64"
        ),
      })
    );

    await context.route("https://lagis-api.cismet.de/users", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: "cismet",
          domain: "LAGIS",
          jwt: "0000000",
          passHash: "0000000",
          userGroups: ["Lagerbuch", "NKF"],
        }),
      })
    );
    // Add this mock for flurstuecke data
    await context.route(
      "https://lagis-api.cismet.de/graphql/LAGIS/execute",
      (route) => {
        const requestBody = route.request().postDataJSON();

        // Check if it's a flurstuecke query FIRST (since it also contains "gemarkung")
        if (requestBody.query.includes("view_flurstueck_schluessel")) {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              data: {
                view_flurstueck_schluessel: [
                  {
                    alkis_id: "053001-003-00039",
                    schluessel_id: 2197,
                    flurstueckart: "städtisch",
                    historisch: false,
                  },
                  {
                    alkis_id: "053001-003-00040",
                    schluessel_id: 2198,
                    flurstueckart: "städtisch",
                    historisch: false,
                  },
                  {
                    alkis_id: "053001-003-00041",
                    schluessel_id: 2199,
                    flurstueckart: "städtisch",
                    historisch: false,
                  },
                ],
                gemarkung: [
                  {
                    schluessel: 3001,
                    bezeichnung: "Barmen",
                  },
                  {
                    schluessel: 3271,
                    bezeichnung: "Haan",
                  },
                ],
              },
            }),
          });
        }

        // Check if it's the detailed flurstueck query (with variables) FIRST
        if (
          requestBody.query.includes("extended_alkis_flurstueck") &&
          requestBody.variables &&
          (requestBody.variables.alkis_id ||
            requestBody.variables.schluessel_id)
        ) {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(responseWithTwoOffices),
          });
        }

        // Check if it's a gemarkung-only query (without variables)
        if (
          requestBody.query.includes("gemarkung") &&
          (!requestBody.variables ||
            Object.keys(requestBody.variables).length === 0)
        ) {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(gemarkung),
          });
        }

        // Default fallback for other queries
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: {} }),
        });
      }
    );

    // Navigate to the application
    await page.goto("/");
    // Check initial page load
    // await expect(page.locator('text=LagIS')).toBeVisible();

    // Perform authentication
    await page.fill('input[type="email"]', "cismet");
    await page.fill('input[type="password"]', "cismet");
    await page.click(".ant-btn");

    // Wait for authentication and page load
    await page.waitForTimeout(5000);

    // Verify authenticated state - check for fuzzy search component
    await expect(page.locator("[data-test-id=fuzzy-search]")).toBeVisible();

    // Check for menu items
    const menuItems = page.locator(".ant-menu-item");
    await expect(menuItems).toHaveCount(9);

    // Check for "Karte" text
    await expect(page.locator("text=Karte")).toBeVisible();

    // Verify the new LandParcelSearch component is visible
    await expect(
      page.locator("[data-test-id=land-parcel-search]")
    ).toBeVisible();

    // Wait for landparcel data to be loaded into the store
    await page.waitForTimeout(2000);

    // Focus the autocomplete input and type the full landparcel key.
    // The new LandParcelSearch calls tryDirectLandParcelMatch on a full
    // "Gemarkung-Flur-Flurstück" input and renders a single matching option.
    const landParcelInput = page.locator(
      "[data-test-id=land-parcel-search] input"
    );
    await landParcelInput.click();
    await page.waitForTimeout(500);
    await landParcelInput.pressSequentially("Barmen-3-39/0", { delay: 50 });
    await page.waitForTimeout(1000);

    // Select the matching flurstueck option from the dropdown
    const flurstueckOption = page
      .locator(".ant-select-dropdown .ant-select-item")
      .filter({ hasText: "Barmen-3-39/0" })
      .first();
    await expect(flurstueckOption).toBeVisible();
    await flurstueckOption.click();
    await page.waitForTimeout(1500);

    // Verify URL parameters are set correctly
    const currentUrl = page.url();
    expect(currentUrl).toContain("gem=Barmen");
    expect(currentUrl).toContain("flur=3");
    expect(currentUrl).toContain("fstck=39-0");

    // Verify Verwaltungsbereiche section shows 2 items
    const verwaltungsbereicheText = page.locator("text=Verwaltungsbereiche");
    await expect(verwaltungsbereicheText).toBeVisible();

    const verwaltungsbereicheContainer = page
      .locator("text=Verwaltungsbereiche")
      .locator("..");
    const containerText = await verwaltungsbereicheContainer.textContent();
    expect(containerText).toContain("2");

    const link = await page.getByRole("link", {
      name: "Verwaltungsbereiche",
    });
    await link.click();

    await page.waitForTimeout(1000);
    const officesTitle = page.locator("text=Dienststellen");
    await expect(officesTitle).toBeVisible();

    // Check one office
    const officeName = page.getByRole("row", { name: "GMW." }).locator("div");
    await expect(officeName).toBeVisible();
    const officeArea = page.getByRole("cell", { name: "7719" });
    await expect(officeArea).toBeVisible();

    // Logout
    // await page.click(".logout");

    // Verify logout - should see LagIS Desktop
    // await expect(page.locator('text=LagIS Desktop')).toBeVisible();
  });
});
