import type {
  Item,
  LayerConfig,
  ToolEntry,
} from "../lib/contracts/carma-layers.d";
import type { DiscoverProps } from "../helper/discover";
import type { CatalogFilters } from "../helper/catalogFilter";
import type { CatalogConfigEntry } from "../helper/buildCatalog";
import { serviceConfig } from "../helper/config";
import { ASSET_BASE_URL } from "../helper/assetUrls";

/**
 * A vector style added to the catalog by url alone: title, description,
 * keywords, tags, thumbnail and legend all come from the style's
 * `metadata.carmaConf.layerInfo`, exactly as when the style is dropped onto the
 * map. On its own it lands in the same "Externe Dienste" category a drop does;
 * inside the `layers` of a titled entry it lands in that entry's category.
 */
export type AdditionalStyleLayer = {
  styleUrl: string;
  /** item id, defaults to the `custom:<styleUrl>` a drop of that url would use */
  id?: string;
  /** "object" files it as a 3d twin item, as a dropped *.twin.json does */
  type?: "layer" | "object";
  /**
   * Addons declared per layer (e.g. "alwaysOnTop"). They are added to what the
   * style's `layerInfo` already declares, they do not replace it.
   */
  tools?: ToolEntry[];
};

/**
 * A catalog item this config moves into another category, named by its id
 * (`"<serviceName>:<layerName>"`). The item keeps its definition, but it is
 * shown where the entry stands instead of in the category it comes from.
 */
export type AdditionalLayerReference = {
  layerId: string;
  /**
   * Addons declared per layer (e.g. "alwaysOnTop"). They are added to what the
   * referenced item already declares, they do not replace it.
   */
  tools?: ToolEntry[];
};

/**
 * A layer inside an entry: a full item, a style url standing in for one, or the
 * id of a catalog item to pull in. A bare string is read as a style url when it
 * looks like one (`http(s)://…` or `….json`), else as an item id.
 */
export type AdditionalEntryLayer =
  | Item
  | string
  | AdditionalStyleLayer
  | AdditionalLayerReference;

/**
 * An entry in the shape of `additionalLayerConfig.json`, except that any of its
 * layers may be written as a style url. A `Title` makes the entry a category of
 * its own, which is where its layers are then filed.
 */
export type AdditionalLayerEntry = Omit<CatalogConfigEntry, "layers"> & {
  layers: AdditionalEntryLayer[];
};

/**
 * One entry of `additionalLayers`: a full entry, or a style url shorthand for a
 * single layer. A bare string is the shorthand with all defaults.
 *
 * `mergeId` / `replaceId` layers are not supported here: those rewrite the
 * service structure app-wide, before the capabilities are read.
 */
export type AdditionalLayer =
  | string
  | AdditionalStyleLayer
  | AdditionalLayerReference
  | AdditionalLayerEntry;

export type LayerCatalogConfig = {
  /** WMS/config services whose capabilities fill the catalog */
  services: Record<string, LayerConfig>;
  /** base url for static assets (additional layer/sensor/object configs) */
  assetBaseUrl: string;
  /** discover API access (appKey, apiUrl, daqKey); omit to disable discover */
  discoverProps?: DiscoverProps;
  /** server url substituted for __SERVER_URL__ placeholders in dropped configs */
  vectorTileServerUrl: string;
  /**
   * always-active filters restricting the catalog to matching items, with
   * empty categories hidden; a flat filter list is AND-combined (values
   * within one filter OR each other), a list of filter groups OR-combines
   * the groups (an item must match every filter of at least one group)
   */
  filters?: CatalogFilters;
  /**
   * Layers shown in this catalog on top of the fetched sources, the counterpart
   * of `filters`. They are never hidden by `filters`, since both come from the
   * same config.
   */
  additionalLayers?: AdditionalLayer[];
};

export const wuppDiscoverProps: DiscoverProps = {
  appKey: "Geoportal.Online.Wuppertal",
  apiUrl: "https://wunda-cloud-api.cismet.de",
  daqKey: "gp_entdecken",
};

export const wuppLayerCatalogConfig: LayerCatalogConfig = {
  services: serviceConfig,
  assetBaseUrl: ASSET_BASE_URL,
  discoverProps: wuppDiscoverProps,
  vectorTileServerUrl: "https://tiles.cismet.de",
};
