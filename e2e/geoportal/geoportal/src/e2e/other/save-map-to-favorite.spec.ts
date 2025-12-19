import { test, expect } from "@playwright/test";
import { setupAllMocks, mockGeoportalServices } from "@carma-commons/e2e";

test.describe("Geoportal - save map to favorite", () => {
  test.beforeEach(async ({ context, page }) => {
    await setupAllMocks(context);
    await mockGeoportalServices(context);

    await page.goto(
      "/#/?lat=51.2586922&lng=7.1510696&zoom=12&config=847e07f9bee9a4f8&appKey=sharedurl"
    );
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
    const layerTagPlayground = page.getByRole("button", {
      name: "Kinderspielplätze",
    });
    await expect(layerTagPlayground).toBeVisible();
    const layerTagKindergarten = page.getByRole("button", {
      name: "Kindertagesstätten",
    });
    await expect(layerTagKindergarten).toBeVisible();

    // Check dialog content
    const dialogTitle = page.getByRole("heading", { name: "Karte speichern" });
    await expect(dialogTitle).toBeVisible();
    const titleInput = page.getByRole("textbox", { name: "Titel" });
    await titleInput.fill("Kita title");
    const contentInput = page.getByRole("textbox", { name: "Inhalt" });
    await contentInput.fill("Kita content");
    const saveFavoriteBtn = page.getByRole("button", {
      name: "Als Favorit speichern",
    });
    await saveFavoriteBtn.click();

    await expect(dialogTitle).not.toBeVisible();

    // const successMessage = page.getByText(
    //   "Karte a wurde erfolgreich gespeichert."
    // );
    // await expect(successMessage).toBeVisible();

    // close layers tags
    page.locator('[id="removeLayerButton-wuppPOI\\:poi_ksp"]').click();
    await expect(layerTagPlayground).not.toBeVisible();
    page.locator('[id="removeLayerButton-wuppPOI\\:poi_kita"]').click();
    await expect(layerTagKindergarten).not.toBeVisible();
    const messageAlert = page
      .getByRole("img", { name: "check-circle" })
      .locator("path");
    await expect(messageAlert).toBeVisible();
    await expect(messageAlert).not.toBeVisible();

    // Go to favorites
    await expect(addLayersBtn).toBeVisible();
    addLayersBtn.click();
    const favoriteBtn = page.getByText("Favoriten");
    await expect(favoriteBtn).toBeVisible();
    favoriteBtn.click();

    // Load favorite map
    const kitaCardTitle = page.getByRole("heading", { name: "Kita title" });
    await expect(kitaCardTitle).toBeVisible();
    const loadBtn = page.getByTestId("card-layer-prev").getByRole("button");
    await expect(loadBtn).toBeVisible();
    await loadBtn.click();
    await expect(messageAlert).toBeVisible();
    await expect(messageAlert).not.toBeVisible();
    page.getByTestId("card-layer-prev").getByRole("button");
    const closeDialogBtn = page.getByRole("dialog").getByRole("button").nth(1);
    await expect(closeDialogBtn).toBeVisible();
    await closeDialogBtn.click();
    await expect(kitaCardTitle).not.toBeVisible();
    await expect(layerTagPlayground).toBeVisible();
    await expect(layerTagKindergarten).toBeVisible();

    // Go to favorites
    await expect(addLayersBtn).toBeVisible();
    addLayersBtn.click();
    await expect(favoriteBtn).toBeVisible();
    favoriteBtn.click();
    await expect(kitaCardTitle).toBeVisible();
    const detailsBtn = page
      .getByTestId("card-layer-prev")
      .locator("svg")
      .nth(2);
    await expect(detailsBtn).toBeVisible();
    detailsBtn.click();
    const infoCard = page.getByTestId("card-layer-detailed-info");
    await expect(infoCard).toBeVisible();
    const removeBtn = page
      .getByTestId("card-layer-detailed-info")
      .getByRole("button", { name: "Löschen" });
    await expect(removeBtn).toBeVisible();
    removeBtn.click();
    const popUpAlert = page.getByRole("heading", {
      name: "Zusammenstellung Kita title",
    });
    await expect(popUpAlert).toBeVisible();
    const confirmRemoving = page
      .getByRole("button", { name: "Löschen" })
      .nth(2);
    expect(confirmRemoving).toBeVisible();
    await confirmRemoving.click();
    await expect(popUpAlert).not.toBeVisible();
    await expect(infoCard).not.toBeVisible();
  });
});
