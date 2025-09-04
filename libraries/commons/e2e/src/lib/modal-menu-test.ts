import { expect, Page } from "@playwright/test";
export type ModalMenuOptions = {
  minAccordionCount?: number;
  openButtonSelector?: string;
  footerSelector?: string;
  closeButtonSelector?: string;
};

/**
 * Open the modal menu, verify content, toggle sections, and close.
 */
export async function runModalMenuTest(
  page: Page,
  opts: ModalMenuOptions = {}
) {
  const {
    minAccordionCount = 3,
    openButtonSelector = "#cmdShowModalApplicationMenu",
    footerSelector = ".modal-footer",
    closeButtonSelector = "#cmdCloseModalApplicationMenu",
  } = opts;

  // Open
  await page.locator(openButtonSelector).click();

  const accordions = page.locator(".accordion");
  const count = await accordions.count();
  expect(count).toBeGreaterThanOrEqual(minAccordionCount);

  for (let i = 0; i < count; i++) {
    const accordion = accordions.nth(i);

    await expect(accordion).toBeVisible();

    const accBtn = accordion.locator("button").first();
    await expect(accBtn).toBeVisible();

    const content = accordion.locator(".card-body").first();

    if (!(await content.isVisible())) {
      await accBtn.click();
      await expect(content).toBeVisible();
    }

    const text = await content.innerText();
    const len = text.replace(/\s+/g, " ").trim().length; // normalize whitespace
    // console.log(`Accordion ${i} text: ${text.slice(0, 10)}...`);
    expect(len).toBeGreaterThanOrEqual(10);
  }

  // Footer
  await expect(page.locator(footerSelector)).toBeVisible();

  // Close
  const closeBtn = page.locator(closeButtonSelector);
  await expect(closeBtn).toBeVisible();
  await closeBtn.click();
  await expect(closeBtn).toBeHidden();
}
