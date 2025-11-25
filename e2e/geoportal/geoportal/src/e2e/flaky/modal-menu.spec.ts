import { setupAllMocks } from "@carma-commons/e2e";
import { test, expect } from "@playwright/test";
import { toggleAccordion, runModalMenuTest } from "@carma-commons/e2e";

// const checkAccordion = async (page: Page) => {
//   await toggleAccordion(page, "positionieren");
//   await toggleAccordion(page, "standort");
//   await toggleAccordion(page, "zwilling");
// };

test.describe("Modal menu opens and contains header, introduction, sections, footer.", () => {
  test.beforeEach(async ({ context, page }) => {
    await setupAllMocks(context);
    await page.goto("/");
  });

  test("Modal menu opens and contains header, introduction, sections, footer.", async ({
    page,
  }) => {
    // await page.locator('[data-test-id="modal-menu-btn"]').click();

    await runModalMenuTest(page, {
      openButtonSelector: '[data-test-id="modal-menu-btn"]',
      // menuOpenCallback: checkAccordion,
    });
  });
});
