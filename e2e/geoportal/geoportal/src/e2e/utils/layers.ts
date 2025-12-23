import { expect, type Page, type Locator } from "@playwright/test";
export type LayerName = {
  name: string;
  tag: string;
};

export function layerTag(page: Page, name: string): Locator {
  return page.getByRole("button", { name });
}

export async function expectLayerTagsVisible(page: Page, names: LayerName[]) {
  for (const item of names) {
    await expect(layerTag(page, item.name)).toBeVisible();
  }
}

export async function expectLayerTagsNotVisible(
  page: Page,
  names: LayerName[]
) {
  for (const item of names) {
    await expect(layerTag(page, item.name)).not.toBeVisible();
  }
}

export async function expectLayerTagsNotVisibleAfterClick(
  page: Page,
  names: LayerName[]
) {
  for (const item of names) {
    const tagId = "removeLayerButton-wuppPOI:" + item.tag;
    await await page.locator(`[id="${tagId}"]`).click();
    await expect(layerTag(page, item.name)).not.toBeVisible();
  }
}

export async function navigateToMapLayersDialog(
  page: Page,
  navElement: Locator,
  secElement: Locator
) {
  //Check that navElement is visible
  await expect(navElement).toBeVisible();
  //Click on navElement
  await navElement.click();
  await expect(secElement).toBeVisible();
  await secElement.click();
}

export async function loadMapLayerAndCloseDialog(
  page: Page,
  cardTitle: Locator
) {
  await expect(cardTitle).toBeVisible({ timeout: 15000 });
  const loadBtn = page.getByTestId("card-layer-prev").getByRole("button");
  await expect(loadBtn).toBeVisible();
  await loadBtn.click();
  const closeDialogBtn = page.getByRole("dialog").getByRole("button").nth(1);
  await expect(closeDialogBtn).toBeVisible();
  await closeDialogBtn.click();
  await expect(cardTitle).not.toBeVisible();
}

export async function removeMapLayer(page: Page) {
  const detailsBtn = page.getByTestId("card-layer-prev").locator("svg").nth(2);
  await expect(detailsBtn).toBeVisible();
  await detailsBtn.click();
  const infoCard = page.getByTestId("card-layer-detailed-info");
  await expect(infoCard).toBeVisible();
  const removeBtn = page
    .getByTestId("card-layer-detailed-info")
    .getByRole("button", { name: "Löschen" });
  await expect(removeBtn).toBeVisible();
  await removeBtn.click();
  const popUpAlert = page.getByTestId("confirm-delete-collection-dialog");
  await expect(popUpAlert).toBeVisible();
  const confirmRemoving = page.getByTestId("confirm-delete-collection-submit");
  expect(confirmRemoving).toBeVisible();
  await confirmRemoving.click();
  await expect(popUpAlert).not.toBeVisible();
  await expect(infoCard).not.toBeVisible();
}
