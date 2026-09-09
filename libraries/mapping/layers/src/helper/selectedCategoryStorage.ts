/**
 * Persistence of the catalog's selected main category, so a reload reopens the
 * modal on the category the user last worked in. The id is stored, never the
 * sidebar index: the sidebar is derived (feature flags, 3D, filters), so an
 * index would point at a different category after a reload.
 *
 * The scope is the storage namespace of the route, not the app: routes carry
 * their own category registry (a Fachzwilling adds its Workflows), so one
 * shared key would hand a route an id its sidebar does not know and let the
 * last route visited overwrite every other route's category.
 */
export const buildSelectedCategoryStorageKey = (
  scope = "carma",
  storagePrefix = "defaultStorage"
) => `@${scope}.${storagePrefix}.catalog.selectedCategory`;

export const loadSelectedCategoryId = (storageKey: string): string | null => {
  try {
    return localStorage.getItem(storageKey);
  } catch (error) {
    console.error(
      "[LayerCatalog] could not read the selected category from",
      storageKey,
      error
    );
    return null;
  }
};

export const persistSelectedCategoryId = (
  storageKey: string,
  categoryId: string
) => {
  try {
    localStorage.setItem(storageKey, categoryId);
  } catch (error) {
    console.error(
      "[LayerCatalog] could not persist the selected category to",
      storageKey,
      error
    );
  }
};
