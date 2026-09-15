import {
  defaultLayerConf,
  type BackgroundLayerCatalogEntry,
  type LayerMap,
} from "@carma-appframeworks/portals";

import {
  backgroundConfig,
  buildBackgroundLayerCatalog,
} from "./backgroundConfig";

export const host = import.meta.env.VITE_WUPP_ASSET_BASEURL;
export const APP_KEY = "geoportal";
export const STORAGE_PREFIX = "1";

/**
 * Which base map a configuration means when it names none. Only reached through
 * a `backgroundLayer` that says whether it is visible but not which map it is,
 * so a configuration can ask for no base map without having to pick one first:
 *
 *     "backgroundLayer": { "visible": false }
 *
 * The two belong together: `id` is the group the map switch shows as selected,
 * `selectedLayerId` the entry of `layerMap` actually drawn.
 */
export const DEFAULT_BACKGROUND_LAYER_ID = backgroundConfig.defaultCategory;
const defaultCategory = backgroundConfig.categories.find(
  (category) => category.id === DEFAULT_BACKGROUND_LAYER_ID
);
export const DEFAULT_BACKGROUND_SELECTED_LAYER_ID =
  defaultCategory.defaultEntry ?? defaultCategory.entries[0];

/** the base maps of the route the app started on, see backgroundConfig */
export const layerMap: LayerMap = backgroundConfig.layerMap;

export const backgroundLayerCatalog: BackgroundLayerCatalogEntry[] =
  buildBackgroundLayerCatalog(backgroundConfig);

export const convertLayerStringToLayers = (
  layerString: string,
  visible: boolean,
  mainOpacity?: number
): any => {
  const layers = layerString.split("|");
  return layers.map((layer) => {
    const [layerConfigName, opacity] = layer.split("@");
    const config = defaultLayerConf.namedLayers[layerConfigName];
    return {
      ...config,
      visible,
      layerType: config.type,
      opacity: ((Number(opacity) || 1) / 100) * mainOpacity || 1,
    };
  });
};
