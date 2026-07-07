import { useMemo, useState } from "react";
import Fuse, { type IFuseOptions } from "fuse.js";
import { useDebounce } from "@uidotdev/usehooks";
import type { SavedLayerConfig } from "../lib/contracts/carma-layers.d";

export type CatalogSubCategory = {
  Title: string;
  layers: SavedLayerConfig[];
  id?: string;
  mainCategoryId?: string;
  hideWhenEmpty?: boolean;
};

export type CatalogMainCategory = {
  id: string;
  categories: CatalogSubCategory[];
};

type SearchableLayer = SavedLayerConfig & {
  keywords?: string[];
  tags?: string[];
};

const FUSE_OPTIONS: IFuseOptions<SearchableLayer> = {
  keys: [
    { name: "title", weight: 2 },
    { name: "description", weight: 1 },
    { name: "keywords", weight: 1 },
    { name: "tags", weight: 1 },
  ],
  shouldSort: false,
  includeMatches: true,
  useExtendedSearch: true,
  ignoreLocation: true,
  threshold: 0.1,
};

export const createSearchIndex = (
  categories: CatalogMainCategory[]
): Fuse<SearchableLayer> => {
  const flattenedLayers = categories.flatMap((mainCategory) =>
    mainCategory.categories.flatMap(
      (subCategory) => subCategory.layers as SearchableLayer[]
    )
  );
  return new Fuse(flattenedLayers, FUSE_OPTIONS);
};

export const filterCategoriesBySearchTerm = (
  categories: CatalogMainCategory[],
  searchIndex: Fuse<SearchableLayer>,
  searchTerm: string,
  disabledCategoryIds: ReadonlySet<string>
): CatalogMainCategory[] => {
  if (!searchTerm) {
    return categories;
  }
  const results = searchIndex.search(searchTerm);
  return categories.map((mainCategory) => ({
    ...mainCategory,
    categories: mainCategory.categories.map((subCategory) => ({
      ...subCategory,
      layers:
        disabledCategoryIds.has(mainCategory.id) || !subCategory.id
          ? []
          : results
              .filter((result) => result.item.serviceName === subCategory.id)
              .map((result) => ({ ...result.item })),
    })),
  }));
};

export const findFirstCategoryIdWithResults = (
  categories: CatalogMainCategory[]
): string | undefined =>
  categories.find((mainCategory) =>
    mainCategory.categories.some((subCategory) => subCategory.layers.length > 0)
  )?.id;

export const useCatalogSearch = ({
  allCategories,
  disabledCategoryIds,
}: {
  allCategories: CatalogMainCategory[];
  disabledCategoryIds: ReadonlySet<string>;
}) => {
  const [searchValue, setSearchValue] = useState("");
  const debouncedSearchTerm = useDebounce(searchValue, 300);

  const searchIndex = useMemo(
    () => createSearchIndex(allCategories),
    [allCategories]
  );

  const filteredCategories = useMemo(
    () =>
      filterCategoriesBySearchTerm(
        allCategories,
        searchIndex,
        debouncedSearchTerm,
        disabledCategoryIds
      ),
    [allCategories, searchIndex, debouncedSearchTerm, disabledCategoryIds]
  );

  // true while the debounce has not caught up with the input yet
  const isSearching = searchValue !== debouncedSearchTerm;

  return {
    searchValue,
    setSearchValue,
    debouncedSearchTerm,
    isSearching,
    filteredCategories,
  };
};
