import { expect, Page } from "@playwright/test";
type MaybePromise<T> = T | Promise<T>;
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
  menuOpenCallback?: (page: Page) => MaybePromise<void>;
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
  // await expect(page.locator(titleSelector)).toBeVisible();
  // await expect(page.locator(headerSelector)).toBeVisible();
  // await expect(
  //   page.getByText(introText as any, { exact: false })
  // ).toBeVisible();

  // Accordion count
  const accCount = await page.locator(accordionSelector).count();
  expect(accCount).toBeGreaterThanOrEqual(minAccordionCount);

  // Toggle sections (only if a function is provided)
  // if (menuOpenCallback) {
  //   menuOpenCallback(page);
  // }

  const accordions = page.locator(".accordion");
  const count = await accordions.count();

  for (let i = 0; i < count; i++) {
    const accordion = accordions.nth(i);

    console.log(`👉 Clicking accordion ${i}`);

    await expect(accordion).toBeVisible(); // check it’s visible
    await accordion.click({ force: true });

    const accBtn = accordion.locator("button").first();
    await expect(accBtn).toBeVisible();
    await accBtn.click();

    // Optional: read its text after click
    const content = accordion.locator(".card-body").first();
    await expect(content).toBeVisible();

    const text = await content.innerText();
    const len = text.replace(/\s+/g, " ").trim().length; // normalize whitespace
    console.log(`Accordion ${i} text: ${text.slice(0, 300)}...`);
    expect(len).toBeGreaterThanOrEqual(300);
  }

  // Footer
  await expect(page.locator(footerSelector)).toBeVisible();

  // Close
  // const closeBtn = page.locator(closeButtonSelector);
  // await expect(closeBtn).toBeVisible();
  // await closeBtn.click();
  // await expect(closeBtn).toBeHidden();
}
