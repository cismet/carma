import { expect, Page } from "@playwright/test";
import { runModalMenuTest } from "./modal-menu-test";

/**
 * Options for configuring smoke test behavior
 */
export interface SmokeTestOptions {
  /** Timeout for fuzzy search visibility check (default: 10000ms) */
  fuzzySearchTimeout?: number;
  /** Whether to check zoom control visibility (default: true) */
  checkZoomControl?: boolean;
  /** Whether to check fuzzy search visibility (default: true) */
  checkFuzzySearch?: boolean;
  /** Whether to check application menu visibility (default: true) */
  checkApplicationMenu?: boolean;
  /** Whether to check info box visibility (default: true) */
  checkInfoBox?: boolean;
}

/**
 * Runs a comprehensive smoke test on a topic map page to verify key UI elements are visible.
 * This function checks for the presence of essential components that indicate the app has loaded properly.
 *
 * @param page - The Playwright page object
 * @param options - Optional configuration for the smoke test
 */
export async function runMapSmokeTest(
  page: Page,
  options: SmokeTestOptions = {}
): Promise<void> {
  const {
    fuzzySearchTimeout = 10000,
    checkZoomControl = true,
    checkFuzzySearch = true,
    checkApplicationMenu = true,
    checkInfoBox = true,
  } = options;

  if (checkZoomControl) {
    // Check that zoom control is visible
    await expect(page.locator("[data-test-id=zoom-control]")).toBeVisible();
  }

  if (checkFuzzySearch) {
    // Check that fuzzy search is visible (this is a key indicator the app loaded)
    await expect(page.locator("[data-test-id=fuzzy-search]")).toBeVisible({
      timeout: fuzzySearchTimeout,
    });
  }

  if (checkApplicationMenu) {
    // Check that application menu button is visible
    // await expect(page.locator("#cmdShowModalApplicationMenu")).toBeVisible();
    await runModalMenuTest(page);
  }

  if (checkInfoBox) {
    // Check that info box is visible
    await expect(page.locator("[data-test-id=info-box]")).toBeVisible();
  }
}

/**
 * Checks if the zoom control element is visible on the page
 * @param page - The Playwright page object
 */
export async function checkZoomControlVisible(page: Page): Promise<void> {
  await expect(page.locator("[data-test-id=zoom-control]")).toBeVisible();
}

/**
 * Checks if the fuzzy search element is visible on the page
 * @param page - The Playwright page object
 * @param timeout - Timeout in milliseconds (default: 10000)
 */
export async function checkFuzzySearchVisible(
  page: Page,
  timeout = 10000
): Promise<void> {
  await expect(page.locator("[data-test-id=fuzzy-search]")).toBeVisible({
    timeout,
  });
}

/**
 * Checks if the application menu button is visible on the page
 * @param page - The Playwright page object
 */
export async function checkApplicationMenuVisible(page: Page): Promise<void> {
  await expect(page.locator("#cmdShowModalApplicationMenu")).toBeVisible();
}

/**
 * Checks if the info box element is visible on the page
 * @param page - The Playwright page object
 */
export async function checkInfoBoxVisible(page: Page): Promise<void> {
  await expect(page.locator("[data-test-id=info-box]")).toBeVisible();
}
