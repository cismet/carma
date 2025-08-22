import { expect, Page } from "@playwright/test";

export type ModalMenuOptions = {
  introText?: string | RegExp;
  minAccordionCount?: number;
  sectionsToToggle?: string[];
  openButtonSelector?: string;
  titleSelector?: string;
  headerSelector?: string;
  footerSelector?: string;
  closeButtonSelector?: string;
  accordionSelector?: string;

  /**
   * Open the modal menu, verify content, toggle sections, and close.
   */
  menuOpenCallback?: (page: Page) => void | null;
};

/**
 * Open the modal menu, verify content, toggle sections, and close.
 */
export async function runModalMenuTest(
  page: Page,
  opts: ModalMenuOptions = {}
) {
  const {
    introText = /Wählen Sie eine der folgenden farbigen Schaltflächen/i,
    minAccordionCount = 4,
    openButtonSelector = "#cmdShowModalApplicationMenu",
    titleSelector = ".modal-title",
    headerSelector = ".modal-header",
    footerSelector = ".modal-footer",
    closeButtonSelector = "#cmdCloseModalApplicationMenu",
    accordionSelector = ".accordion",
    menuOpenCallback = null,
  } = opts;

  // Open
  await page.locator(openButtonSelector).click();

  // Core checks
  await expect(page.locator(titleSelector)).toBeVisible();
  await expect(page.locator(headerSelector)).toBeVisible();
  await expect(
    page.getByText(introText as any, { exact: false })
  ).toBeVisible();

  // Accordion count
  const accCount = await page.locator(accordionSelector).count();
  expect(accCount).toBeGreaterThanOrEqual(minAccordionCount);

  // Toggle sections (only if a function is provided)
  if (menuOpenCallback) {
    menuOpenCallback(page);
  }

  // Footer
  await expect(page.locator(footerSelector)).toBeVisible();

  // Close
  const closeBtn = page.locator(closeButtonSelector);
  await expect(closeBtn).toBeVisible();
  await closeBtn.click();
  await expect(closeBtn).toBeHidden();
}
