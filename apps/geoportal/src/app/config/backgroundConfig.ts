import type {
  BackgroundLayerCatalogEntry,
  LayerInfo,
  LayerMap,
} from "@carma-appframeworks/portals";
import {
  LAYER_PROVIDER_TYPES,
  type BackgroundLayer,
} from "@carma-mapping/layers";
import { isAvailable, type AvailabilityContext } from "@carma-commons/utils";

import { findFachzwillingRouteByPath } from "../constants/fachzwillinge/routes";
import { initialRoutePath } from "../store/app-key";
import { availabilityContext } from "./availability";
import {
  geoportalBackgroundConfig,
  type BackgroundCategory,
  type BackgroundConfig,
  type BackgroundConfigOverride,
} from "./geoportalBackground";

const isCompleteLayerInfo = (entry: Partial<LayerInfo>): entry is LayerInfo =>
  typeof entry.title === "string" && typeof entry.layers === "string";

/**
 * The route's overrides merged over the base config, reduced to what is
 * available here: base maps and categories with an `availability` that does
 * not hold are left out, and so are entries that name no base map at all. The
 * latter is an error rather than a crash of every consumer that reads
 * `layerMap[id].title`; an empty category is dropped too.
 */
export const resolveBackgroundConfig = (
  base: BackgroundConfig,
  override: BackgroundConfigOverride | undefined,
  context: AvailabilityContext
): BackgroundConfig => {
  const layerMap: LayerMap = {};
  for (const [id, entry] of Object.entries(base.layerMap)) {
    if (isAvailable(entry.availability, context)) {
      layerMap[id] = entry;
    }
  }
  for (const [id, entry] of Object.entries(override?.layerMap ?? {})) {
    const merged = { ...base.layerMap[id], ...entry };
    if (!isCompleteLayerInfo(merged)) {
      console.error(
        `[BACKGROUND] base map "${id}" is new to this route and needs at least title and layers; ignoring it.`
      );
    } else if (isAvailable(merged.availability, context)) {
      layerMap[id] = {
        description: "",
        inhalt: "",
        eignung: "",
        ...merged,
      };
    } else {
      delete layerMap[id];
    }
  }

  const categories = (override?.categories ?? base.categories).flatMap(
    (category) => {
      if (!isAvailable(category.availability, context)) {
        return [];
      }
      const entries = category.entries.filter((id) => {
        if (layerMap[id]) {
          return true;
        }
        // an unavailable base map is a deliberate omission, not a config error
        if (!base.layerMap[id] && !override?.layerMap?.[id]) {
          console.error(
            `[BACKGROUND] category "${category.id}" names unknown base map "${id}"; dropping it.`
          );
        }
        return false;
      });
      if (entries.length === 0) {
        console.error(
          `[BACKGROUND] category "${category.id}" has no base maps left; dropping it.`
        );
        return [];
      }
      const defaultEntry =
        category.defaultEntry && entries.includes(category.defaultEntry)
          ? category.defaultEntry
          : entries[0];
      return [{ ...category, entries, defaultEntry }];
    }
  );

  const hasCategory = (id: string | undefined): id is string =>
    id !== undefined && categories.some((category) => category.id === id);
  const overrideDefault = override?.defaultCategory;
  const defaultCategory = hasCategory(overrideDefault)
    ? overrideDefault
    : hasCategory(base.defaultCategory)
    ? base.defaultCategory
    : categories[0]?.id;

  return {
    categories,
    defaultCategory,
    layerMap,
    namedLayers:
      base.namedLayers || override?.namedLayers
        ? { ...base.namedLayers, ...override?.namedLayers }
        : undefined,
  };
};

/**
 * The background of the route the app started on. Resolved once, like the
 * storage namespace (see STORE_APP_KEY) and the availability context: the
 * store's initial state and the persisted selection are built from it, and a
 * switch to another route is a page reload anyway. The one case that does not
 * reload, an explicit `?appKey=` pinning one namespace for every route, keeps
 * the boot route's background as well.
 */
export const backgroundConfig: BackgroundConfig = resolveBackgroundConfig(
  geoportalBackgroundConfig,
  findFachzwillingRouteByPath(initialRoutePath)?.background,
  availabilityContext
);

export const findBackgroundCategory = (
  id: string
): BackgroundCategory | undefined =>
  backgroundConfig.categories.find((category) => category.id === id);

/** what the category is called in the given engine */
export const getBackgroundCategoryTitle = (
  category: BackgroundCategory,
  isLeaflet: boolean
): string => (isLeaflet ? category.title : category.title3d ?? category.title);

/**
 * The store's shape of a base map: the layerMap entry plus the visitor's
 * opacity and visibility. Every place that turns a base map id into a
 * `BackgroundLayer` goes through here, so the "wmts" default lives once.
 */
export const toBackgroundLayer = (
  id: string,
  state: { opacity?: number; visible?: boolean } = {},
  layerMap: LayerMap = backgroundConfig.layerMap
): BackgroundLayer => {
  const entry = layerMap[id];
  return {
    id,
    title: entry.title,
    opacity: state.opacity ?? 1.0,
    description: entry.description,
    inhalt: entry.inhalt,
    eignung: entry.eignung,
    layerType: entry.layerType ?? LAYER_PROVIDER_TYPES.WMTS,
    visible: state.visible ?? true,
    layers: entry.layers,
  };
};

/**
 * Flat list of every base map of every category, in config order. The entry's
 * `group` and `style` are both the category id (see BackgroundCategory).
 */
export const buildBackgroundLayerCatalog = (
  config: BackgroundConfig
): BackgroundLayerCatalogEntry[] =>
  config.categories.flatMap((category) =>
    category.entries.map((id) => ({
      id,
      title: config.layerMap[id].title,
      group: category.id,
      style: category.id,
      config: toBackgroundLayer(id, {}, config.layerMap),
    }))
  );
