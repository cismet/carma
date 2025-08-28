import { Page, expect } from "@playwright/test";

/**
 * Configuration options for setting up smoke tests
 */
export interface SmokeTestSetupOptions {
  /** Base URL for the application */
  baseUrl?: string;
  /** Timeout for page navigation (default: 30000ms) */
  navigationTimeout?: number;
  /** Whether to wait for network idle after navigation (default: true) */
  waitForNetworkIdle?: boolean;
}

/**
 * Waits for the application to be ready by checking for key indicators
 * @param page - The Playwright page object
 * @param timeout - Timeout in milliseconds (default: 15000)
 */
export async function waitForAppReady(
  page: Page,
  timeout = 15000
): Promise<void> {
  // Wait for the fuzzy search to be visible as it's a key indicator the app is loaded
  await expect(page.locator("[data-test-id=fuzzy-search]")).toBeVisible({
    timeout,
  });

  // Wait for any loading indicators to disappear
  const loadingIndicator = page.locator("[data-test-id=loading-indicator]");
  try {
    await loadingIndicator.waitFor({ state: "hidden", timeout: 5000 });
  } catch {
    // Loading indicator might not be present, continue
  }
}

/**
 * Sets up a page for smoke testing by navigating and waiting for readiness
 * @param page - The Playwright page object
 * @param url - The URL to navigate to
 * @param options - Setup options
 */
export async function setupSmokeTest(
  page: Page,
  url: string,
  options: SmokeTestSetupOptions = {}
): Promise<void> {
  const { navigationTimeout = 30000, waitForNetworkIdle = true } = options;

  // Navigate to the page
  await page.goto(url, {
    timeout: navigationTimeout,
    waitUntil: waitForNetworkIdle ? "networkidle" : "load",
  });

  // Wait for the app to be ready
  await waitForAppReady(page);
}

/**
 * Takes a screenshot with a descriptive name for debugging
 * @param page - The Playwright page object
 * @param name - Descriptive name for the screenshot
 */
export async function takeDebugScreenshot(
  page: Page,
  name: string
): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  await page.screenshot({
    path: `debug-screenshots/${name}-${timestamp}.png`,
    fullPage: true,
  });
}

/**
 * Waits for an element to be visible with retry logic
 * @param page - The Playwright page object
 * @param selector - CSS selector or data-test-id
 * @param timeout - Total timeout in milliseconds (default: 10000)
 * @param retries - Number of retries (default: 3)
 */
export async function waitForElementWithRetry(
  page: Page,
  selector: string,
  timeout = 10000,
  retries = 3
): Promise<void> {
  let lastError: Error | null = null;

  for (let i = 0; i < retries; i++) {
    try {
      await expect(page.locator(selector)).toBeVisible({ timeout });
      return; // Success, exit early
    } catch (error) {
      lastError = error as Error;
      if (i < retries - 1) {
        // Wait a bit before retrying
        await page.waitForTimeout(1000);
      }
    }
  }

  throw (
    lastError ||
    new Error(`Element ${selector} not visible after ${retries} retries`)
  );
}

/**
 * Checks if the current page is a topic map application
 * @param page - The Playwright page object
 */
export async function isTopicMapApp(page: Page): Promise<boolean> {
  try {
    // Check for presence of key topic map elements
    const fuzzySearch = page.locator("[data-test-id=fuzzy-search]");
    const zoomControl = page.locator("[data-test-id=zoom-control]");

    await fuzzySearch.waitFor({ state: "visible", timeout: 5000 });
    await zoomControl.waitFor({ state: "visible", timeout: 5000 });

    return true;
  } catch {
    return false;
  }
}

/**
 * Takes a screenshot with a descriptive name for debugging
 * @param page - The Playwright page object
 * @param name - The section attribute name starts with a lowercase first letter
 */
export async function toggleAccordion(page: Page, sectionName: string) {
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
