import {
  setupAllMocks,
  mockGeoportalServices,
  runModalMenuTest,
} from "@carma-commons/e2e";
import { test } from "@playwright/test";

test.describe("Modal menu opens and contains header, introduction, sections, footer.", () => {
  test.beforeEach(async ({ context, page }) => {
    await setupAllMocks(context);
    await mockGeoportalServices(context);
    await page.goto("/");
  });

  test("Modal menu opens and contains header, introduction, sections, footer.", async ({
    page,
  }) => {
    await runModalMenuTest(page, {
      openButtonSelector: '[data-test-id="modal-menu-btn"]',
      // menuOpenCallback: checkAccordion,
    });
  });
});
