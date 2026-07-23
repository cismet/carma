import {
  faBook,
  faCubes,
  faList,
  faMap,
  faMapPin,
  faSearch,
  faStar,
  type IconDefinition,
} from "@fortawesome/free-solid-svg-icons";

import type { Item, SavedLayerConfig } from "../lib/contracts/carma-layers.d";
import type { CatalogSubCategory } from "../hooks/useCatalogSearch";
import { partianTwinConfig } from "../helper/config";

/** where a main category gets its content from during buildCatalog */
export type CategoryContentSource =
  /** filled exclusively by custom category definitions (favorites section) */
  | "custom"
  /** the fetched discover items; the category is absent while they are */
  | "discover"
  /** fixed subcategories from `staticCategories` */
  | "static"
  /** service structure x additional config x drops ("Kartenebenen") */
  | "serviceLayers"
  /** config entries keyed by the category id (sensors, objects, + drops) */
  | "configs"
  /** sidebar pseudo entry without own content */
  | "searchResults";

export interface CategoryDefinition {
  id: string;
  label: string;
  icon: IconDefinition;
  /** sidebar entry disabled while the 3D map is active */
  disabledIn3D?: boolean;
  /** sidebar entry disabled while the category has no items */
  disableWhenEmpty?: boolean;
  /** category is exempt from the active catalog filters (always shown in full) */
  ignoreCatalogFilters?: boolean;
  source: CategoryContentSource;
  /** subcategories for source "static" */
  staticCategories?: CatalogSubCategory[];
  subCategories?: CustomCategoryDefinition[];
}

const isDigitalTwinFavorite = (item: Item) =>
  item.serviceName === "wuppTopicMaps" ||
  item.serviceName === "wuppArcGisOnline";

export const defaultFavoriteSubCategories: CustomCategoryDefinition[] = [
  {
    id: "favoriteDigitalTwins",
    label: "Meine Themenzwillinge",
    source: { kind: "favorites", filter: isDigitalTwinFavorite },
  },
  {
    id: "collections",
    label: "Meine Karten",
    hiddenIn3D: true,
    source: { kind: "collections" },
  },
  {
    id: "favoriteLayers",
    label: "Meine Kartenebenen",
    hiddenIn3D: true,
    source: {
      kind: "favorites",
      filter: (item) => !isDigitalTwinFavorite(item) && item.type !== "object",
    },
  },
  {
    id: "favoriteObjects",
    label: "Meine Objekte",
    source: { kind: "favorites", filter: (item) => item.type === "object" },
  },
];

export const defaultCategoryDefinitions: CategoryDefinition[] = [
  {
    id: "favorites",
    label: "Favoriten",
    icon: faStar,
    source: "custom",
    subCategories: defaultFavoriteSubCategories,
  },
  {
    id: "discover",
    label: "Entdecken",
    icon: faList,
    source: "discover",
    disabledIn3D: true,
  },
  {
    id: "partialTwins",
    label: "Themenzwillinge",
    icon: faBook,
    source: "static",
    staticCategories: Object.values(partianTwinConfig),
  },
  {
    id: "mapLayers",
    label: "Kartenebenen",
    icon: faMap,
    source: "serviceLayers",
    disabledIn3D: true,
  },
  {
    id: "sensors",
    label: "Sensoren",
    icon: faMapPin,
    source: "configs",
    disabledIn3D: true,
    disableWhenEmpty: true,
  },
  {
    id: "objects",
    label: "Objekte",
    icon: faCubes,
    source: "configs",
    disableWhenEmpty: true,
  },
  {
    id: "searchResults",
    label: "Suchergebnisse",
    icon: faSearch,
    source: "searchResults",
  },
];

/**
 * Content of a custom subcategory: the provider favorites (optionally
 * narrowed by a predicate), the host's savedCollections prop, or items the
 * host passes directly.
 */
export type CustomCategorySource =
  | { kind: "favorites"; filter?: (item: Item) => boolean }
  | { kind: "collections" }
  | { kind: "items"; items: Array<Item | SavedLayerConfig> };

export interface CustomCategoryDefinition {
  id: string;
  label: string;
  /** main category the subcategory lands in, default "favorites" */
  mainCategoryId?: string;
  hideWhenEmpty?: boolean;
  /** drop the subcategory entirely while the 3D map is active */
  hiddenIn3D?: boolean;
  /** keep each item's own serviceName instead of stamping the category id */
  keepItemServiceName?: boolean;
  source: CustomCategorySource;
}

export const resolveCustomCategories = (
  definitions: CustomCategoryDefinition[],
  favorites: Item[],
  savedCollections: Array<Item | SavedLayerConfig>,
  isCesium: boolean
): CatalogSubCategory[] =>
  definitions
    .filter((definition) => !(definition.hiddenIn3D && isCesium))
    .map((definition) => {
      const items =
        definition.source.kind === "favorites"
          ? definition.source.filter
            ? favorites.filter(definition.source.filter)
            : favorites
          : definition.source.kind === "collections"
          ? savedCollections
          : definition.source.items;
      return {
        id: definition.id,
        Title: definition.label,
        mainCategoryId: definition.mainCategoryId,
        hideWhenEmpty: definition.hideWhenEmpty,
        layers: items.map((item) => ({
          ...item,
          serviceName: definition.keepItemServiceName
            ? (item as Item).serviceName
            : definition.id,
          path: definition.label,
        })),
      };
    });
