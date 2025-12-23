import { test, expect } from "@playwright/test";
import { setupAllMocks, mockGeoportalServices } from "@carma-commons/e2e";
import {
  expectLayerTagsNotVisibleAfterClick,
  expectLayerTagsVisible,
  layersNamesArr,
  loadMapLayerAndCloseDialog,
  navigateToMapLayersDialog,
  removeMapLayer,
  setupSaveMapToFavoriteMocks,
  urlWithMapLayers,
} from "../utils/layers";

test.describe("Geoportal - save map to favorite", () => {
  test.beforeEach(async ({ context, page }) => {
    await setupAllMocks(context);
    await mockGeoportalServices(context);
    await setupSaveMapToFavoriteMocks(page);

    await page.goto(urlWithMapLayers, { waitUntil: "domcontentloaded" });
  });

  test("Save Map dialog — save map with layers to Favorites", async ({
    page,
  }) => {
    // Check map layers and save map button are visible
    const saveMapBtn = page.getByTestId("speichern-btn");
    await expect(saveMapBtn).toBeVisible();
    await saveMapBtn.click();
    const addLayersBtn = page.getByTestId("kartenebenen-hinzufügen-btn");
    await expect(addLayersBtn).toBeVisible();
    await expectLayerTagsVisible(page, layersNamesArr);

    // Check dialog content
    const dialogTitle = page.getByRole("heading", { name: "Karte speichern" });
    await expect(dialogTitle).toBeVisible({ timeout: 15000 });
    const titleInput = page.getByRole("textbox", { name: "Titel" });
    await titleInput.fill("Kita title");
    const contentInput = page.getByRole("textbox", { name: "Inhalt" });
    await contentInput.fill("Kita content");
    const saveFavoriteBtn = page.getByRole("button", {
      name: "Als Favorit speichern",
    });
    await saveFavoriteBtn.click();

    await expect(dialogTitle).not.toBeVisible();

    // close layers tags
    await expectLayerTagsNotVisibleAfterClick(page, layersNamesArr);

    // Go to favorites
    const favoriteBtn = page.getByText("Favoriten");
    await navigateToMapLayersDialog(page, addLayersBtn, favoriteBtn);

    // Load favorite map
    const kitaCardTitle = page.getByRole("heading", { name: "Kita title" });
    await loadMapLayerAndCloseDialog(page, kitaCardTitle);

    // Go to favorites
    await navigateToMapLayersDialog(page, addLayersBtn, favoriteBtn);
    await removeMapLayer(page);
  });
});
