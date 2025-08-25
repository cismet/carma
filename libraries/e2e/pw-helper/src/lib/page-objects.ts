import { Page, Locator } from "@playwright/test";

/**
 * Base page object for common topic map elements
 */
export class TopicMapPage {
  readonly page: Page;
  readonly zoomControl: Locator;
  readonly fuzzySearch: Locator;
  readonly applicationMenuButton: Locator;
  readonly infoBox: Locator;

  constructor(page: Page) {
    this.page = page;
    this.zoomControl = page.locator("[data-test-id=zoom-control]");
    this.fuzzySearch = page.locator("[data-test-id=fuzzy-search]");
    this.applicationMenuButton = page.locator("#cmdShowModalApplicationMenu");
    this.infoBox = page.locator("[data-test-id=info-box]");
  }

  /**
   * Wait for the page to be ready by checking if fuzzy search is visible
   * @param timeout - Timeout in milliseconds (default: 10000)
   */
  async waitForPageReady(timeout = 10000): Promise<void> {
    await this.fuzzySearch.waitFor({ state: "visible", timeout });
  }

  /**
   * Check if all essential elements are visible
   */
  async areEssentialElementsVisible(): Promise<boolean> {
    try {
      await this.zoomControl.waitFor({ state: "visible", timeout: 5000 });
      await this.fuzzySearch.waitFor({ state: "visible", timeout: 5000 });
      await this.applicationMenuButton.waitFor({
        state: "visible",
        timeout: 5000,
      });
      await this.infoBox.waitFor({ state: "visible", timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Extended page object with additional common elements
 */
export class ExtendedTopicMapPage extends TopicMapPage {
  readonly searchInput: Locator;
  readonly mapContainer: Locator;
  readonly loadingIndicator: Locator;

  constructor(page: Page) {
    super(page);
    this.searchInput = page.locator("[data-test-id=search-input]");
    this.mapContainer = page.locator("[data-test-id=map-container]");
    this.loadingIndicator = page.locator("[data-test-id=loading-indicator]");
  }

  /**
   * Wait for the map to finish loading
   * @param timeout - Timeout in milliseconds (default: 15000)
   */
  async waitForMapLoaded(timeout = 15000): Promise<void> {
    // Wait for loading indicator to disappear if present
    try {
      await this.loadingIndicator.waitFor({ state: "hidden", timeout: 5000 });
    } catch {
      // Loading indicator might not be present, continue
    }

    // Wait for map container to be visible
    await this.mapContainer.waitFor({ state: "visible", timeout });
  }

  /**
   * Perform a search using the fuzzy search input
   * @param searchTerm - The term to search for
   */
  async performSearch(searchTerm: string): Promise<void> {
    await this.searchInput.fill(searchTerm);
    await this.searchInput.press("Enter");
  }
}
