import { setupAllMocks } from "@carma-commons/e2e";
import { test, expect } from "@playwright/test";

test.describe("geoportal share", () => {
  test.beforeEach(async ({ context, page }) => {
    await setupAllMocks(context);
    // Patch clipboard writes before the app loads
    // Purpose: capture what the app copies without needing real clipboard permissions.

    await page.addInitScript(() => {
      const original = navigator.clipboard?.writeText?.bind(
        navigator.clipboard
      );
      (window as any).__copiedTexts = [] as string[];
      navigator.clipboard.writeText = async (text: string) => {
        (window as any).__copiedTexts.push(text);
        try {
          if (original) {
            await original(text);
          }
        } catch {
          // ignore clipboard permission errors in CI
        }
      };
    });

    await page.goto("/");
  });

  test("Share buttons add to clipboard a configured link.", async ({
    page,
  }) => {
    const shareBtn = page.locator('[data-test-id="teilen-btn"]');
    await expect(shareBtn).toBeVisible();
    await shareBtn.click();

    const copyBtn = page.getByText("Link kopieren", { exact: false });
    await expect(copyBtn).toBeVisible();

    // --- First copy ---
    await copyBtn.click();

    // Wait until something was copied
    await page.waitForFunction(
      () => (window as any).__copiedTexts?.length >= 1
    );
    const firstUrl = await page.evaluate(
      () => (window as any).__copiedTexts.at(-1) as string
    );

    // Assert: must contain lat/lng and either data= or config=
    expect(firstUrl).toMatch(/[?&#]lat=-?\d+(\.\d+)?/);
    expect(firstUrl).toMatch(/[?&#]lng=-?\d+(\.\d+)?/);
    expect(firstUrl).toMatch(/(?:[?&#]data=|[?&#]config=)/);
  });
});
