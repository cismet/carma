import { extractCarmaConfig } from "@carma-commons/utils";

import type {
  CatalogMainCategory,
  CatalogSubCategory,
} from "../hooks/useCatalogSearch";
import type { SavedLayerConfig } from "../lib/contracts/carma-layers.d";

/** item fields a filter can match against */
export type CatalogFilterField =
  | "entityType"
  | "layerType"
  | "mapMode"
  | "keywords"
  | "category"
  | "id";

/**
 * One catalog filter: an item matches when its field equals any of the
 * values (values within one filter OR each other).
 * `layerType` matches the effective render type ("vector" also for WMS
 * layers styled via a carmaConf vectorStyle keyword),
 * `mapMode` matches the modes an item is available in,
 * `keywords` values match case-insensitive substrings of keywords/tags,
 * `category` values match the main or sub category id the item sits in,
 * `id` values match item ids exactly ("<serviceName>:<layerName>"), for
 * curated configs that pin down an explicit set of items
 */
export type CatalogFilter = {
  field: CatalogFilterField;
  values: string[];
};

/** filters within a group are AND-combined */
export type CatalogFilterGroup = CatalogFilter[];

/**
 * Filter input as configs declare it: a flat filter list is a single
 * AND-group, a list of groups OR-combines the groups (an item matches
 * when it satisfies every filter of at least one group).
 */
export type CatalogFilters = CatalogFilter[] | CatalogFilterGroup[];

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

const filterMatchesItem = (
  item: FilterableItem,
  filter: CatalogFilter,
  context: CategoryContext
): boolean => {
  switch (filter.field) {
    case "entityType":
      return !!item.type && filter.values.includes(item.type);
    case "layerType": {
      const effectiveLayerType = getEffectiveLayerType(item);
      return !!effectiveLayerType && filter.values.includes(effectiveLayerType);
    }
    case "mapMode":
      return getItemMapModes(item).some((mode) => filter.values.includes(mode));
    case "keywords": {
      const itemKeywords = [...(item.keywords ?? []), ...(item.tags ?? [])];
      return filter.values.some((value) =>
        itemKeywords.some((keyword) =>
          keyword.toLowerCase().includes(value.toLowerCase())
        )
      );
    }
    case "category":
      return (
        filter.values.includes(context.mainCategoryId) ||
        (!!context.subCategoryId &&
          filter.values.includes(context.subCategoryId))
      );
    case "id":
      return !!item.id && filter.values.includes(item.id);
  }
};

/** normalizes both accepted shapes to groups, dropping empty groups */
export const toCatalogFilterGroups = (
  filters: CatalogFilters
): CatalogFilterGroup[] => {
  const groups = filters.every(Array.isArray)
    ? (filters as CatalogFilterGroup[])
    : [filters as CatalogFilter[]];
  return groups.filter((group) => group.length > 0);
};

export const itemMatchesFilters = (
  item: FilterableItem,
  filters: CatalogFilters,
  context: CategoryContext
): boolean => {
  const groups = toCatalogFilterGroups(filters);
  return (
    groups.length === 0 ||
    groups.some((group) =>
      group.every((filter) => filterMatchesItem(item, filter, context))
    )
  );
};

export type CatalogFilterExemptions = {
  categoryIds?: ReadonlySet<string>;
  itemIds?: ReadonlySet<string>;
};

export const filterCategoriesByFilters = (
  categories: CatalogMainCategory[],
  filters: CatalogFilters,
  exemptions?: CatalogFilterExemptions
): CatalogMainCategory[] => {
  const groups = toCatalogFilterGroups(filters);
  if (groups.length === 0) {
    return categories;
  }
  const { categoryIds: exemptCategoryIds, itemIds: exemptItemIds } =
    exemptions ?? {};
  return categories.map((mainCategory) =>
    exemptCategoryIds?.has(mainCategory.id)
      ? mainCategory
      : {
          ...mainCategory,
          categories: mainCategory.categories.map(
            (subCategory): CatalogSubCategory => ({
              ...subCategory,
              layers: subCategory.layers.filter(
                (layer) =>
                  (!!layer?.id && !!exemptItemIds?.has(layer.id)) ||
                  itemMatchesFilters(layer, groups, {
                    mainCategoryId: mainCategory.id,
                    subCategoryId: subCategory.id,
                  })
              ),
            })
          ),
        }
  );
};
