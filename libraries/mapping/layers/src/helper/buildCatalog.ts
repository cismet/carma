import type { WMSCapabilitiesJSON } from "wms-capabilities";
import type {
  Config,
  ExtendedItem,
  Item,
  XMLLayer,
} from "../lib/contracts/carma-layers.d";
import type {
  CatalogMainCategory,
  CatalogSubCategory,
} from "../hooks/useCatalogSearch";
import {
  flattenLayer,
  reorderLayersByInsertRules,
  wmsLayerToGenericItem,
} from "./layerHelper";
import { isCurrentlyFeatured } from "./dateHelper";
import { filterCategoriesByDeployment } from "./deploymentRestriction";
import { discoverConfig } from "./discover";
import type { DiscoverItem } from "./discover";
import type { DeploymentTarget } from "@carma-commons/utils";
import type { CategoryDefinition } from "../config/categoryDefinitions";
import { defaultCategoryDefinitions } from "../config/categoryDefinitions";

// The additional configs come from JSON files where `Title` is optional; a
// config without Title contributes per-layer entries (or replace layers)
// instead of an own subcategory.
export type CatalogConfigEntry = Omit<Config, "Title"> & { Title?: string };

// One entry of the derived service structure (redux `allLayers`).
export type ServiceCategory = { Title: string; id: string; layers: Item[] };

/**
 * A subcategory whose layers are still catalog items, i.e. before they are
 * widened to the `SavedLayerConfig` view the UI consumes. Keeping the item type
 * lets item-only fields (`keywords`, `path`) stay readable, which the featured
 * derivation below needs.
 */
export type ItemSubCategory = { id?: string; Title: string; layers: Item[] };

export type FeatureFlags = Record<string, boolean>;

export const CUSTOM_CATEGORY = {
  id: "custom",
  Title: "Externe Dienste",
} as const;
const DEFAULT_MAIN_CATEGORY_ID = "favorites";
const FEATURED_FROM = "carmaconf://featuredFrom";
const FEATURED_UNTIL = "carmaconf://featuredUntil";

const dedupeById = <T extends { id: string }>(layers: T[]): T[] =>
  layers.filter(
    (layer, index) => layers.findIndex((l) => l.id === layer.id) === index
  );

const passesFeatureFlags = (layer: Item, featureFlags: FeatureFlags): boolean =>
  layer.ff ? !!featureFlags[layer.ff] : true;

const applyConfigServiceName = (
  config: CatalogConfigEntry,
  featureFlags: FeatureFlags
): Item[] =>
  (config.layers ?? [])
    .filter((layer) => passesFeatureFlags(layer, featureFlags))
    .map((layer) => ({
      ...layer,
      serviceName: config.serviceName || layer.serviceName,
    }));

// --- dropped sources ---------------------------------------------------------

// Everything the user dropped onto the window becomes part of this state; the
// catalog derivation folds it over the fetched sources, so a drop updates the
// catalog through the same pure rebuild as any other source change.
export interface DroppedCatalogState {
  /** dropped vector styles / twin files / WMS capabilities layers ("Externe Dienste") */
  customLayers: Item[];
  /** dropped additional layer configs, applied as overlay over the fetched config */
  layerConfigs: CatalogConfigEntry[];
  /** dropped sensor/object configs by category id, prepended to the fetched ones */
  categoryConfigs: Partial<Record<string, CatalogConfigEntry[]>>;
}

export const EMPTY_DROPPED_CATALOG: DroppedCatalogState = {
  customLayers: [],
  layerConfigs: [],
  categoryConfigs: {},
};

export type CatalogDrop =
  | { kind: "layers"; items: Item[] }
  | { kind: "layerConfig"; configs: CatalogConfigEntry[] }
  | {
      kind: "categoryConfig";
      categoryId: string;
      configs: CatalogConfigEntry[];
    };

// Pure reducer for drop events: the newest drop always wins, either by moving
// to the front (items, category configs) or to the end (layer configs, whose
// consumer lets later overlays overwrite).
export const applyCatalogDrop = (
  state: DroppedCatalogState,
  drop: CatalogDrop
): DroppedCatalogState => {
  switch (drop.kind) {
    case "layers": {
      const items = drop.items.map((item) => ({
        ...item,
        path: item.path || CUSTOM_CATEGORY.Title,
      }));
      return {
        ...state,
        customLayers: dedupeById([...items, ...state.customLayers]),
      };
    }
    case "layerConfig":
      return {
        ...state,
        layerConfigs: [...state.layerConfigs, ...drop.configs],
      };
    case "categoryConfig": {
      const existing = state.categoryConfigs[drop.categoryId] ?? [];
      return {
        ...state,
        categoryConfigs: {
          ...state.categoryConfigs,
          [drop.categoryId]: [...drop.configs, ...existing],
        },
      };
    }
  }
};

// Ids of everything the user dropped, from all three drop kinds. Catalog
// filters (fachzwillinge configs) are curated for the fetched sources and
// cannot know these ids, so they are exempted from filtering.
export const getDroppedItemIds = (
  dropped: DroppedCatalogState
): Set<string> => {
  const ids = new Set<string>();
  const addConfigLayers = (configs: CatalogConfigEntry[]) =>
    configs.forEach((config) =>
      (config.layers ?? []).forEach((layer) => {
        if (layer.id) {
          ids.add(layer.id);
        }
      })
    );

  dropped.customLayers.forEach((layer) => {
    if (layer.id) {
      ids.add(layer.id);
    }
  });
  addConfigLayers(dropped.layerConfigs);
  Object.values(dropped.categoryConfigs).forEach((configs) =>
    addConfigLayers(configs ?? [])
  );

  return ids;
};

// Turns parsed WMS capabilities (dropped file or URL) into catalog items for
// the "Externe Dienste" subcategory.
export const wmsCapabilitiesToCustomItems = (
  capabilities: WMSCapabilitiesJSON
): Item[] => {
  const getMapUrl =
    capabilities.Capability.Request.GetMap.DCPType[0].HTTP.Get.OnlineResource;
  const flattened = flattenLayer(capabilities.Capability.Layer, [], getMapUrl);
  const layers: XMLLayer[] = flattened.layers ?? [];
  const items: Item[] = [];
  layers.forEach((layer) => {
    const item = wmsLayerToGenericItem(layer, CUSTOM_CATEGORY.id);
    if (item) {
      items.push({ ...item, path: CUSTOM_CATEGORY.Title });
    }
  });
  return items;
};

// Applies dropped layer configs over the fetched additional config: layers
// with a known id override the existing definition (shallow merge), unknown
// layers extend the matching config or are appended as a new one.
export const mergeAdditionalConfigs = (
  base: CatalogConfigEntry[],
  overlays: CatalogConfigEntry[]
): CatalogConfigEntry[] => {
  if (overlays.length === 0) {
    return base;
  }
  const merged = base.map((config) => ({
    ...config,
    layers: [...(config.layers ?? [])],
  }));

  overlays.forEach((overlay) => {
    const unmatchedLayers: Item[] = [];
    (overlay.layers ?? []).forEach((overlayLayer) => {
      let matched = false;
      merged.forEach((config) => {
        config.layers = config.layers.map((layer) => {
          if (layer.id === overlayLayer.id) {
            matched = true;
            return { ...layer, ...overlayLayer } as Item;
          }
          return layer;
        });
      });
      if (!matched) {
        unmatchedLayers.push(overlayLayer);
      }
    });
    if (unmatchedLayers.length === 0) {
      return;
    }
    const target = merged.find((config) =>
      overlay.Title
        ? config.Title === overlay.Title ||
          (!!config.serviceName && config.serviceName === overlay.serviceName)
        : !config.Title
    );
    if (target) {
      target.layers.push(...unmatchedLayers);
    } else {
      merged.push({ ...overlay, layers: unmatchedLayers });
    }
  });

  return merged;
};

// --- per-source derivations --------------------------------------------------

// Replace/merge layers from the additional config (title-less entries only,
// matching the previous imperative processing); they are applied inside
// getLayerStructure via the redux replaceLayers, not shown as own items.
export const extractReplaceLayers = (
  configs: CatalogConfigEntry[],
  featureFlags: FeatureFlags
): ExtendedItem[] =>
  configs.flatMap((config) => {
    if (config.Title) {
      return [];
    }
    return applyConfigServiceName(config, featureFlags).filter(
      (layer) => layer.replaceId || layer.mergeId
    );
  });

// Subcategory fragments the additional config contributes to "mapLayers":
// configs with a Title become an own subcategory, title-less configs add
// their layers to the subcategory of the layer's service.
export const deriveAdditionalConfigFragments = (
  configs: CatalogConfigEntry[],
  featureFlags: FeatureFlags
): ItemSubCategory[] => {
  const fragments: ItemSubCategory[] = [];
  const upsert = (id: string | undefined, Title: string, layers: Item[]) => {
    const existing = fragments.find((fragment) => fragment.id === id);
    if (existing) {
      existing.layers = dedupeById([...existing.layers, ...layers]);
    } else {
      fragments.push({ id, Title, layers });
    }
  };

  configs.forEach((config) => {
    const layers = applyConfigServiceName(config, featureFlags);
    if (layers.length === 0) {
      return;
    }
    if (config.Title) {
      upsert(config.serviceName, config.Title, layers);
    } else {
      layers.forEach((layer) => {
        if (layer.replaceId || layer.mergeId) {
          return;
        }
        upsert(layer.serviceName, layer.path ?? "", [layer]);
      });
    }
  });

  return fragments;
};

// Sensor/object configs: one subcategory per config with a Title. Earlier
// configs win on duplicate ids, so dropped configs are passed in first.
export const deriveConfigSubcategories = (
  configs: CatalogConfigEntry[],
  featureFlags: FeatureFlags
): CatalogSubCategory[] => {
  const subCategories: CatalogSubCategory[] = [];
  configs.forEach((config) => {
    if (!config.Title) {
      return;
    }
    const layers = applyConfigServiceName(config, featureFlags);
    if (layers.length === 0) {
      return;
    }
    const id = config.id || config.serviceName;
    const existing = subCategories.find((subCategory) => subCategory.id === id);
    if (existing) {
      existing.layers = reorderLayersByInsertRules(
        dedupeById([...existing.layers, ...layers])
      );
    } else {
      subCategories.push({
        id,
        Title: config.Title,
        layers: reorderLayersByInsertRules(layers),
      });
    }
  });
  return subCategories;
};

export const deriveDiscoverCategories = (
  discoverItems: DiscoverItem[] | undefined
): CatalogSubCategory[] | null => {
  if (!discoverItems || discoverItems.length === 0) {
    return null;
  }
  const parsedItems = discoverItems.map((item) => ({
    ...(JSON.parse(item.config) as Item),
    id: item.id.toString(),
    isDraft: !!item.draft,
    createdAt: item.created_at,
    createdBy: item.created_by,
    updatedAt: item.updated_at,
  }));
  return Object.values(discoverConfig).map((category) => ({
    ...category,
    layers: parsedItems.filter((item) => item.serviceName === category.id),
  }));
};

export const deriveFeaturedSubcategory = (
  categories: { layers: Item[] }[]
): CatalogSubCategory | null => {
  const featuredLayers = dedupeById(
    categories.flatMap((category) =>
      category.layers.filter((layer) =>
        layer.keywords?.some(
          (keyword) =>
            keyword.includes(FEATURED_UNTIL) || keyword.includes(FEATURED_FROM)
        )
      )
    )
  )
    .filter((layer) => {
      const featuredFrom = layer.keywords
        ?.find((keyword) => keyword.includes(FEATURED_FROM))
        ?.split(":")[2];
      const featuredUntil = layer.keywords
        ?.find((keyword) => keyword.includes(FEATURED_UNTIL))
        ?.split(":")[2];
      return isCurrentlyFeatured(featuredFrom, featuredUntil);
    })
    .map((layer) => ({
      ...layer,
      serviceName: "featured",
      path: "Neu",
      originalPath: layer.path,
    }));

  return featuredLayers.length > 0
    ? { id: "featured", Title: "Neu", layers: featuredLayers }
    : null;
};

// --- additional layers of the catalog config ---------------------------------

/** a catalog item moved into another category by its id */
export type ItemReference = { refId: string; path?: string };

/** a layer of an additional category: an own definition, or a reference */
export type AdditionalCategoryLayer = Item | ItemReference;

/**
 * A category the catalog config adds, already resolved as far as the config
 * can: styles are items by now, ids are still references, since only the
 * assembled catalog can say what they point at.
 */
export type AdditionalLayerCategory = {
  Title?: string;
  serviceName?: string;
  layers: AdditionalCategoryLayer[];
};

const isItemReference = (
  layer: AdditionalCategoryLayer
): layer is ItemReference => "refId" in layer;

const indexItemsById = (
  subCategories: CatalogSubCategory[],
  ...loose: Item[][]
): Map<string, Item> => {
  const index = new Map<string, Item>();
  const add = (layers: Item[]) =>
    layers.forEach((layer) => {
      if (layer?.id && !index.has(layer.id)) {
        index.set(layer.id, layer);
      }
    });
  subCategories.forEach((subCategory) => add(subCategory.layers as Item[]));
  loose.forEach(add);
  return index;
};

/**
 * Files the configured additional categories into the subcategories, resolving
 * their references against everything the catalog holds by then. A reference to
 * an id the catalog does not know (yet, while its service loads) is left out.
 *
 * A reference *moves* its item: the config states where that layer belongs
 * here, so it is taken out of the category it came from and shows up once.
 *
 * Returns the layers destined for the custom category, which the caller
 * assembles together with the dropped ones, and the ids that were moved, which
 * the caller drops from those.
 */
const placeAdditionalLayers = (
  subCategories: CatalogSubCategory[],
  additionalLayers: AdditionalLayerCategory[],
  droppedLayers: Item[],
  customFragmentLayers: Item[],
  featureFlags: FeatureFlags
): { customLayers: Item[]; movedIds: Set<string> } => {
  const movedIds = new Set<string>();
  if (additionalLayers.length === 0) {
    return { customLayers: [], movedIds };
  }
  const itemsById = indexItemsById(
    subCategories,
    droppedLayers,
    customFragmentLayers
  );
  const customLayers: Item[] = [];

  const upsert = (id: string | undefined, Title: string, layers: Item[]) => {
    const existing = subCategories.find(
      (subCategory) =>
        (id !== undefined && subCategory.id === id) ||
        subCategory.Title === Title
    );
    if (existing) {
      existing.layers = reorderLayersByInsertRules(
        dedupeById([...existing.layers, ...layers])
      );
    } else {
      subCategories.push({
        id,
        Title,
        layers: reorderLayersByInsertRules(layers),
      });
    }
  };

  const resolved = additionalLayers.map((category) => ({
    category,
    layers: category.layers
      .map((layer) => {
        if (!isItemReference(layer)) {
          return layer;
        }
        const item = itemsById.get(layer.refId);
        if (item) {
          movedIds.add(layer.refId);
        }
        return item;
      })
      .filter(
        (layer): layer is Item =>
          !!layer && passesFeatureFlags(layer, featureFlags)
      ),
  }));

  // out of the category it came from before it is filed into the configured
  // one, so a moved layer is not shown twice
  subCategories.forEach((subCategory) => {
    subCategory.layers = subCategory.layers.filter(
      (layer) => !movedIds.has(layer.id)
    );
  });

  resolved.forEach(({ category, layers }) => {
    if (layers.length === 0) {
      return;
    }
    if (category.Title) {
      upsert(category.serviceName, category.Title, layers);
      return;
    }
    // without a category of its own every layer follows its own path, which is
    // the custom category for a style url written on its own
    layers.forEach((layer) => {
      if (!layer.path || layer.path === CUSTOM_CATEGORY.Title) {
        customLayers.push(layer);
      } else {
        upsert(layer.serviceName, layer.path, [layer]);
      }
    });
  });

  return { customLayers, movedIds };
};

// The "mapLayers" main category: dropped items first, then the featured
// window, then the service structure enriched by the additional config.
export const buildMapLayerSubcategories = (
  serviceCategories: ServiceCategory[],
  additionalConfig: CatalogConfigEntry[],
  droppedLayers: Item[],
  additionalLayers: AdditionalLayerCategory[],
  featureFlags: FeatureFlags
): CatalogSubCategory[] => {
  const subCategories: CatalogSubCategory[] = serviceCategories.map(
    (category) => ({
      id: category.id,
      Title: category.Title,
      layers: [...category.layers],
    })
  );

  const fragments = deriveAdditionalConfigFragments(
    additionalConfig,
    featureFlags
  );
  // Fragments carrying the custom service (configured style layers, and
  // dropped layer configs naming it) belong in the one custom subcategory
  // assembled below, not in a second subcategory with the same id.
  const customFragmentLayers: Item[] = [];
  fragments.forEach((fragment) => {
    if (fragment.id === CUSTOM_CATEGORY.id) {
      customFragmentLayers.push(...fragment.layers);
      return;
    }
    const existing = subCategories.find(
      (subCategory) => subCategory.id === fragment.id
    );
    if (existing) {
      existing.layers = reorderLayersByInsertRules(
        dedupeById([...existing.layers, ...fragment.layers])
      );
    } else {
      subCategories.push(fragment);
    }
  });

  // The fragments belong in the featured window too: a layer the additional
  // config contributes on its own (no replaceId/mergeId, so nothing folds it
  // into the service structure) is absent from serviceCategories and would
  // otherwise never reach "Neu", even though its other fields do show up.
  const featured = deriveFeaturedSubcategory([
    ...serviceCategories,
    ...fragments,
  ]);
  if (featured) {
    subCategories.unshift(featured);
  }

  const { customLayers: customAdditionalLayers, movedIds } =
    placeAdditionalLayers(
      subCategories,
      additionalLayers,
      droppedLayers,
      customFragmentLayers,
      featureFlags
    );

  // dropped first: a drop of an id the config also contributes is the more
  // recent statement about that layer
  const customLayers = dedupeById([
    ...droppedLayers,
    ...customFragmentLayers,
    ...customAdditionalLayers,
  ]).filter(
    (layer) => !movedIds.has(layer.id) || customAdditionalLayers.includes(layer)
  );
  if (customLayers.length > 0) {
    subCategories.unshift({ ...CUSTOM_CATEGORY, layers: customLayers });
  }

  return subCategories;
};

// Custom subcategories supplied by the host app: the favorites main category
// is fully owned by them; for other main categories they are prepended and
// replace derived subcategories with the same id.
export const mergeCustomCategories = (
  catalog: CatalogMainCategory[],
  customCategories: CatalogSubCategory[]
): CatalogMainCategory[] => {
  const grouped = new Map<string, CatalogSubCategory[]>();
  customCategories.forEach((subCategory) => {
    const mainCategoryId =
      subCategory.mainCategoryId ?? DEFAULT_MAIN_CATEGORY_ID;
    grouped.set(mainCategoryId, [
      ...(grouped.get(mainCategoryId) ?? []),
      subCategory,
    ]);
  });

  const merged = catalog.map((mainCategory) => {
    const custom = grouped.get(mainCategory.id);
    if (!custom) {
      return mainCategory;
    }
    grouped.delete(mainCategory.id);
    if (mainCategory.id === DEFAULT_MAIN_CATEGORY_ID) {
      return { ...mainCategory, categories: custom };
    }
    const customIds = new Set(
      custom
        .map((subCategory) => subCategory.id)
        .filter((id): id is string => !!id)
    );
    return {
      ...mainCategory,
      categories: [
        ...custom,
        ...mainCategory.categories.filter(
          (subCategory) => !subCategory.id || !customIds.has(subCategory.id)
        ),
      ],
    };
  });

  grouped.forEach((subCategories, mainCategoryId) => {
    merged.push({ id: mainCategoryId, categories: subCategories });
  });

  return merged;
};

// --- the catalog -------------------------------------------------------------

export interface CatalogSources {
  /** derived service structure (baseConfig x capabilities x replaceLayers) */
  serviceCategories: ServiceCategory[];
  /** effective additional layer config (fetched + dropped overlay) */
  additionalConfig: CatalogConfigEntry[];
  /** config entries for the "configs"-sourced categories, keyed by their id */
  categoryConfigs?: Record<string, CatalogConfigEntry[]>;
  discoverItems?: DiscoverItem[];
  dropped?: DroppedCatalogState;
  /** categories the catalog config adds on top of the fetched sources */
  additionalLayers?: AdditionalLayerCategory[];
}

export interface CatalogBuildOptions {
  featureFlags: FeatureFlags;
  customCategories?: CatalogSubCategory[];
  /** main category registry; order defines the sidebar/tree order */
  categoryDefinitions?: CategoryDefinition[];
  deployment?: DeploymentTarget | null;
}

// Pure derivation of the complete category tree. Main categories follow the
// registry order (= sidebar order), so "first category with search results"
// matches the sidebar.
export const buildCatalog = (
  sources: CatalogSources,
  options: CatalogBuildOptions
): CatalogMainCategory[] => {
  const {
    serviceCategories,
    additionalConfig,
    categoryConfigs = {},
    discoverItems,
    dropped = EMPTY_DROPPED_CATALOG,
    additionalLayers = [],
  } = sources;
  const {
    featureFlags,
    customCategories = [],
    categoryDefinitions = defaultCategoryDefinitions,
    deployment,
  } = options;

  const catalog: CatalogMainCategory[] = [];

  categoryDefinitions.forEach((definition) => {
    switch (definition.source) {
      case "custom":
        catalog.push({ id: definition.id, categories: [] });
        break;
      case "discover": {
        const discoverCategories = deriveDiscoverCategories(discoverItems);
        if (discoverCategories) {
          catalog.push({ id: definition.id, categories: discoverCategories });
        }
        break;
      }
      case "static":
        catalog.push({
          id: definition.id,
          categories: definition.staticCategories ?? [],
        });
        break;
      case "serviceLayers":
        catalog.push({
          id: definition.id,
          categories: buildMapLayerSubcategories(
            serviceCategories,
            additionalConfig,
            dropped.customLayers,
            additionalLayers,
            featureFlags
          ),
        });
        break;
      case "configs":
        catalog.push({
          id: definition.id,
          categories: deriveConfigSubcategories(
            [
              ...(dropped.categoryConfigs[definition.id] ?? []),
              ...(categoryConfigs[definition.id] ?? []),
            ],
            featureFlags
          ),
        });
        break;
      case "searchResults":
        break;
    }
  });

  return filterCategoriesByDeployment(
    mergeCustomCategories(catalog, customCategories),
    deployment
  );
};
