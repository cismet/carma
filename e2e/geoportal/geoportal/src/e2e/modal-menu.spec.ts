import { test, expect, Page } from "@playwright/test";
import { toggleAccordion, runModalMenuTest } from "@e2e-carma/pw-helper";

// const checkAccordion = async (page: Page) => {
//   await toggleAccordion(page, "positionieren");
//   await toggleAccordion(page, "standort");
//   await toggleAccordion(page, "zwilling");
// };

test.describe("Modal menu opens and contains header, introduction, sections, footer.", () => {
  test.beforeEach(async ({ page }) => {
    // Set use.baseURL in playwright.config, or replace with your full URL
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
