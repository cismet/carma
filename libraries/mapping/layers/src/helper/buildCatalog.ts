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
import { partianTwinConfig } from "./config";
import { discoverConfig } from "./discover";
import type { DiscoverItem } from "./discover";

// The additional configs come from JSON files where `Title` is optional; a
// config without Title contributes per-layer entries (or replace layers)
// instead of an own subcategory.
export type CatalogConfigEntry = Omit<Config, "Title"> & { Title?: string };

// One entry of the derived service structure (redux `allLayers`).
export type ServiceCategory = { Title: string; id: string; layers: Item[] };

export type FeatureFlags = Record<string, boolean>;

const CUSTOM_CATEGORY = { id: "custom", Title: "Externe Dienste" } as const;
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
  | { kind: "categoryConfig"; categoryId: string; configs: CatalogConfigEntry[] };

// Pure reducer for drop events: newest drop wins and moves to the front.
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
        layerConfigs: [...drop.configs, ...state.layerConfigs],
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
): CatalogSubCategory[] => {
  const fragments: CatalogSubCategory[] = [];
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
    const existing = subCategories.find(
      (subCategory) => subCategory.id === id
    );
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
  serviceCategories: ServiceCategory[]
): CatalogSubCategory | null => {
  const featuredLayers = serviceCategories
    .flatMap((category) =>
      category.layers.filter((layer) =>
        layer.keywords?.some(
          (keyword) =>
            keyword.includes(FEATURED_UNTIL) || keyword.includes(FEATURED_FROM)
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

// The "mapLayers" main category: dropped items first, then the featured
// window, then the service structure enriched by the additional config.
export const buildMapLayerSubcategories = (
  serviceCategories: ServiceCategory[],
  additionalConfig: CatalogConfigEntry[],
  droppedLayers: Item[],
  featureFlags: FeatureFlags
): CatalogSubCategory[] => {
  const subCategories: CatalogSubCategory[] = serviceCategories.map(
    (category) => ({
      id: category.id,
      Title: category.Title,
      layers: [...category.layers],
    })
  );

  deriveAdditionalConfigFragments(additionalConfig, featureFlags).forEach(
    (fragment) => {
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
    }
  );

  const featured = deriveFeaturedSubcategory(serviceCategories);
  if (featured) {
    subCategories.unshift(featured);
  }

  if (droppedLayers.length > 0) {
    subCategories.unshift({ ...CUSTOM_CATEGORY, layers: droppedLayers });
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
  sensorConfig: CatalogConfigEntry[];
  objectConfig: CatalogConfigEntry[];
  discoverItems?: DiscoverItem[];
  dropped?: DroppedCatalogState;
}

export interface CatalogBuildOptions {
  featureFlags: FeatureFlags;
  customCategories?: CatalogSubCategory[];
}

// Pure derivation of the complete category tree. Main categories follow the
// sidebar order, so "first category with search results" matches the sidebar.
export const buildCatalog = (
  sources: CatalogSources,
  options: CatalogBuildOptions
): CatalogMainCategory[] => {
  const {
    serviceCategories,
    additionalConfig,
    sensorConfig,
    objectConfig,
    discoverItems,
    dropped = EMPTY_DROPPED_CATALOG,
  } = sources;
  const { featureFlags, customCategories = [] } = options;

  const catalog: CatalogMainCategory[] = [
    { id: DEFAULT_MAIN_CATEGORY_ID, categories: [] },
  ];

  const discoverCategories = deriveDiscoverCategories(discoverItems);
  if (discoverCategories) {
    catalog.push({ id: "discover", categories: discoverCategories });
  }

  catalog.push({
    id: "partialTwins",
    categories: Object.values(partianTwinConfig),
  });

  catalog.push({
    id: "mapLayers",
    categories: buildMapLayerSubcategories(
      serviceCategories,
      additionalConfig,
      dropped.customLayers,
      featureFlags
    ),
  });

  catalog.push({
    id: "sensors",
    categories: deriveConfigSubcategories(
      [...(dropped.categoryConfigs["sensors"] ?? []), ...sensorConfig],
      featureFlags
    ),
  });
  catalog.push({
    id: "objects",
    categories: deriveConfigSubcategories(
      [...(dropped.categoryConfigs["objects"] ?? []), ...objectConfig],
      featureFlags
    ),
  });

  return mergeCustomCategories(catalog, customCategories);
};
