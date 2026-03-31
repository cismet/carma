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

    // TODO: Update LandParcelChooser e2e tests for the new LandParcelSearch component
    // The old tests interacted with 3 separate ant-select dropdowns (Gemarkung, Flur, Flurstück).
    // The new component uses a single autocomplete input.
    // Tests should be updated to:
    //   1. Type "Barmen-3-39/0" into the search input
    //   2. Select the matching option from the dropdown
    //   3. Verify URL params (gem=Barmen, flur=..., fstck=...)
    //   4. Verify Verwaltungsbereiche section shows 2 items
    //   5. Verify office data (GMW., area 7719)

    // Logout
    // await page.click(".logout");

    // Verify logout - should see LagIS Desktop
    // await expect(page.locator('text=LagIS Desktop')).toBeVisible();
  });
});
