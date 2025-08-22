import { test, expect, Page } from "@playwright/test";

async function toggleAccordion(page: Page, sectionName: string) {
  // No section should be open initially
  await expect(page.locator(".collapse.show")).toHaveCount(0);

  const btn = page.locator(`[name="${sectionName}"]`).locator("button");
  await expect(btn).toBeVisible();

  // Open
  await btn.click({ force: true });
  const openSection = page.locator(".collapse.show").first();
  await expect(openSection).toBeVisible();

  // Should have some content
  const text = (await openSection.innerText()).trim();
  expect(text.length).toBeGreaterThan(0);

  // Close
  await btn.click({ force: true });
  await expect(page.locator(".collapse.show")).toHaveCount(0);
}

test.describe("Modal menu opens and contains header, introduction, sections, footer.", () => {
  test.beforeEach(async ({ page }) => {
    // Set use.baseURL in playwright.config, or replace with your full URL
    await page.goto("/");
  });

  test("Modal menu opens and contains header, introduction, sections, footer.", async ({
    page,
  }) => {
    await page.locator('[data-test-id="modal-menu-btn"]').click();

    await expect(page.locator(".modal-title")).toBeVisible();
    await expect(page.locator(".modal-header")).toBeVisible();
    await expect(
      page.getByText("Wählen Sie eine der folgenden farbigen Schaltflächen", {
        exact: false,
      })
    ).toBeVisible();

    // Accordion count > 3
    const accCount = await page.locator(".accordion").count();
    expect(accCount).toBeGreaterThan(3);

    // Toggle sections
    await toggleAccordion(page, "positionieren");
    await toggleAccordion(page, "standort");
    await toggleAccordion(page, "zwilling");

    await expect(page.locator(".modal-footer")).toBeVisible();

    const closeBtn = page.locator("#cmdCloseModalApplicationMenu");
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    // After closing, the close button should no longer be visible (modal closed)
    await expect(closeBtn).toBeHidden();
  });
});
