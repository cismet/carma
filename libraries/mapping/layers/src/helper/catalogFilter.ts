import { extractCarmaConfig } from "@carma-commons/utils";

import type {
  CatalogMainCategory,
  CatalogSubCategory,
} from "../hooks/useCatalogSearch";
import type { SavedLayerConfig } from "../lib/contracts/carma-layers.d";

/** item fields a filter option can match against */
export type CatalogFilterField =
  | "entityType"
  | "layerType"
  | "mapMode"
  | "keywords"
  | "category";

export type CatalogFilterOption = {
  id: string;
  label: string;
  field: CatalogFilterField;
  /**
   * the option matches an item whose field equals any of these values;
   * `layerType` matches the effective render type ("vector" also for WMS
   * layers styled via a carmaConf vectorStyle keyword),
   * `mapMode` matches the modes an item is available in,
   * `keywords` values match case-insensitive substrings of keywords/tags,
   * `category` values match the main or sub category id the item sits in
   */
  values: string[];
};

/**
 * One checkbox section of the catalog filter. Active options within a group
 * are OR-combined, active groups are AND-combined. Groups are plain data so
 * app configs can ship their own filters without code.
 */
export type CatalogFilterGroup = {
  id: string;
  label: string;
  options: CatalogFilterOption[];
};

/** a main category with its subcategories, as shown in the category filter */
export type CategoryFilterEntry = {
  id: string;
  label: string;
  subCategories: Array<{ id: string; label: string }>;
};

export const categoryFilterOptionId = (categoryId: string) =>
  `category:${categoryId}`;

/** one flat group over the category tree; main and sub selections OR each other */
export const buildCategoryFilterGroup = (
  entries: CategoryFilterEntry[]
): CatalogFilterGroup => ({
  id: "categories",
  label: "Kategorien",
  options: entries.flatMap((entry) => [
    {
      id: categoryFilterOptionId(entry.id),
      label: entry.label,
      field: "category" as const,
      values: [entry.id],
    },
    ...entry.subCategories.map((subCategory) => ({
      id: categoryFilterOptionId(subCategory.id),
      label: subCategory.label,
      field: "category" as const,
      values: [subCategory.id],
    })),
  ]),
});

export const keywordFilterOptionId = (keyword: string) =>
  `keywordFilter:${keyword}`;

/** user-entered keywords as one group: an item matching any of them is shown */
export const buildKeywordFilterGroup = (
  keywords: string[]
): CatalogFilterGroup => ({
  id: "keywordFilters",
  label: "Schlüsselwörter",
  options: keywords.map((keyword) => ({
    id: keywordFilterOptionId(keyword),
    label: keyword,
    field: "keywords" as const,
    values: [keyword],
  })),
});

// catalog items carry more fields than SavedLayerConfig declares
type FilterableItem = SavedLayerConfig & {
  keywords?: string[];
  tags?: string[];
  layerType?: string;
  mapMode?: string;
  vectorStyle?: string;
  vectorLegend?: string;
  layerInfo?: { mapMode?: string };
};

type CategoryContext = {
  mainCategoryId: string;
  subCategoryId?: string;
};

/**
 * The render type the geoportal actually uses: most WMS layers ship their
 * vector style as a carmaConf keyword, so those count as "vector" and only
 * raster-rendered layers keep their raw layerType (wmts/wmts-nt).
 */
export const getEffectiveLayerType = (
  item: FilterableItem
): string | undefined => {
  const carmaConf = extractCarmaConfig(item.keywords);
  const isVector = !!(
    item.vectorStyle ||
    carmaConf?.vectorStyle ||
    item.vectorLegend ||
    carmaConf?.vectorLegend ||
    item.layerType === "vector"
  );
  return isVector ? "vector" : item.layerType;
};

/**
 * The modes an item can be shown in: an explicit mapMode (top-level, or in
 * layerInfo as saved measurements store it) restricts to that mode; without
 * one, items are 2D-only except objects, which also work in 3D.
 */
export const getItemMapModes = (item: FilterableItem): string[] => {
  const mapMode = item.mapMode ?? item.layerInfo?.mapMode;
  if (mapMode === "2d" || mapMode === "3d") {
    return [mapMode];
  }
  return item.type === "object" ? ["2d", "3d"] : ["2d"];
};

const optionMatchesItem = (
  item: FilterableItem,
  option: CatalogFilterOption,
  context: CategoryContext
): boolean => {
  switch (option.field) {
    case "entityType":
      return !!item.type && option.values.includes(item.type);
    case "layerType": {
      const effectiveLayerType = getEffectiveLayerType(item);
      return (
        !!effectiveLayerType && option.values.includes(effectiveLayerType)
      );
    }
    case "mapMode":
      return getItemMapModes(item).some((mode) =>
        option.values.includes(mode)
      );
    case "keywords": {
      const itemKeywords = [...(item.keywords ?? []), ...(item.tags ?? [])];
      return option.values.some((value) =>
        itemKeywords.some((keyword) =>
          keyword.toLowerCase().includes(value.toLowerCase())
        )
      );
    }
    case "category":
      return (
        option.values.includes(context.mainCategoryId) ||
        (!!context.subCategoryId &&
          option.values.includes(context.subCategoryId))
      );
  }
};

export const itemMatchesActiveFilters = (
  item: FilterableItem,
  filterGroups: CatalogFilterGroup[],
  activeFilterIds: ReadonlySet<string>,
  context: CategoryContext
): boolean =>
  filterGroups.every((group) => {
    const activeOptions = group.options.filter((option) =>
      activeFilterIds.has(option.id)
    );
    if (activeOptions.length === 0) {
      return true;
    }
    return activeOptions.some((option) =>
      optionMatchesItem(item, option, context)
    );
  });

export const filterCategoriesByActiveFilters = (
  categories: CatalogMainCategory[],
  filterGroups: CatalogFilterGroup[],
  activeFilterIds: ReadonlySet<string>
): CatalogMainCategory[] => {
  if (activeFilterIds.size === 0) {
    return categories;
  }
  return categories.map((mainCategory) => ({
    ...mainCategory,
    categories: mainCategory.categories.map(
      (subCategory): CatalogSubCategory => ({
        ...subCategory,
        layers: subCategory.layers.filter((layer) =>
          itemMatchesActiveFilters(layer, filterGroups, activeFilterIds, {
            mainCategoryId: mainCategory.id,
            subCategoryId: subCategory.id,
          })
        ),
      })
    ),
  }));
};

/** the built-in filters; configs can replace them via `filterGroups` */
export const defaultCatalogFilterGroups: CatalogFilterGroup[] = [
  {
    id: "entityType",
    label: "Objekt-Typ",
    options: [
      {
        id: "entityType:layer",
        label: "Layer",
        field: "entityType",
        values: ["layer"],
      },
      {
        id: "entityType:object",
        label: "Objekt",
        field: "entityType",
        values: ["object"],
      },
      {
        id: "entityType:link",
        label: "Link",
        field: "entityType",
        values: ["link"],
      },
      {
        id: "entityType:collection",
        label: "Zusammenstellung",
        field: "entityType",
        values: ["collection"],
      },
    ],
  },
  {
    id: "layerType",
    label: "Layer-Typ",
    options: [
      {
        id: "layerType:vector",
        label: "Vektor",
        field: "layerType",
        values: ["vector"],
      },
      {
        id: "layerType:wms",
        label: "WMS",
        field: "layerType",
        values: ["wmts", "wmts-nt"],
      },
    ],
  },
  {
    id: "mapMode",
    label: "Modus",
    options: [
      {
        id: "mapMode:2d",
        label: "in 2D verfügbar",
        field: "mapMode",
        values: ["2d"],
      },
      {
        id: "mapMode:3d",
        label: "in 3D verfügbar",
        field: "mapMode",
        values: ["3d"],
      },
    ],
  },
];
