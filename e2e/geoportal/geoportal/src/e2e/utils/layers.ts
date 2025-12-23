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
    const tagId = "removeLayerButton-wuppPOI\\:" + item.tag;
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
