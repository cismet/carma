import type {
  CatalogMainCategory,
  CatalogSubCategory,
} from "../hooks/useCatalogSearch";

export interface SidebarEntryLike {
  id: string;
  label: string;
}

/**
 * The subcategories the grid and the tabs show for one sidebar selection.
 *
 * For the search-results entry the result is one pseudo subcategory per main
 * category (all its layers flattened); everywhere else it is the selected
 * main category's subcategories minus the empty hideWhenEmpty ones.
 * Returns null while the search-results entry is selected without a term.
 */
export const getShownCategories = (
  categories: CatalogMainCategory[],
  shownId: string,
  sidebarEntries: SidebarEntryLike[],
  searchValue: string
): CatalogSubCategory[] | null => {
  if (shownId === "searchResults") {
    if (!searchValue) {
      return null;
    }
    return sidebarEntries
      .filter((entry) => entry.id !== "searchResults")
      .map((entry) => {
        const matchingCategory = categories.find(
          (category) => category.id === entry.id
        );
        return {
          Title: entry.label,
          id: entry.id,
          layers:
            matchingCategory?.categories.flatMap(
              (subCategory) => subCategory.layers
            ) ?? [],
        };
      });
  }

  const subCategories = categories.find(
    (mainCategory) => mainCategory.id === shownId
  )?.categories;
  return (
    subCategories?.filter(
      (subCategory) =>
        !(subCategory.hideWhenEmpty && subCategory.layers.length === 0)
    ) ?? null
  );
};

export const countCategoryLayers = (
  categories: CatalogSubCategory[] | null
): number =>
  categories?.reduce((sum, category) => sum + category.layers.length, 0) ?? 0;
