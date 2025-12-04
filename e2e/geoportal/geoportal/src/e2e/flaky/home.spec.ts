import { setupAllMocks, mockGeoportalServices } from "@carma-commons/e2e";
import { test, expect } from "@playwright/test";

async function getLatLngFromHash(page: import("@playwright/test").Page) {
  const { lat, lng } = await page.evaluate(() => {
    let h = window.location.hash || "";
    h = h.replace(/^#\/?/, "");
    if (h.startsWith("?")) h = h.slice(1);
    const p = new URLSearchParams(h);
    // some builds use "flat" — fall back just in case
    const lat = p.get("lat") ?? p.get("flat");
    const lng = p.get("lng");
    return { lat, lng };
  });

  if (!lat || !lng)
    throw new Error("Lat or lng parameter is missing in the URL");
  return { lat, lng };
}

test.describe("geoportal home", () => {
  test.beforeEach(async ({ context, page }) => {
    await setupAllMocks(context);
    await mockGeoportalServices(context);

    await page.goto("/");
  });

  test("Clicking home changes lat/lng in URL", async ({ page }) => {
    const homeBtn = page.locator('[data-test-id="home-control"]');
    await expect(homeBtn).toBeVisible();

    // read initial lat/lng
    const init = await getLatLngFromHash(page);

    // click and wait until either lat or lng changes in the hash
    await Promise.all([
      page.waitForFunction(
        ([prevLat, prevLng]) => {
          let h = window.location.hash || "";
          h = h.replace(/^#\/?/, "");
          if (h.startsWith("?")) h = h.slice(1);
          const p = new URLSearchParams(h);
          const lat = p.get("lat") ?? p.get("flat");
          const lng = p.get("lng");
          return !!lat && !!lng && (lat !== prevLat || lng !== prevLng);
        },
        [init.lat, init.lng],
        { timeout: 10000 }
      ),
      homeBtn.click(),
    ]);

    const now = await getLatLngFromHash(page);
    expect(now.lat).not.toBe(init.lat);
    expect(now.lng).not.toBe(init.lng);
  });
});
