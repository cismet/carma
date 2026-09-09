import type { LayerConfig, ToolEntry } from "../lib/contracts/carma-layers.d";
import type { DiscoverProps } from "../helper/discover";
import type { CatalogFilters } from "../helper/catalogFilter";
import { serviceConfig } from "../helper/config";
import { ASSET_BASE_URL } from "../helper/assetUrls";

/**
 * One configured layer: either the url of a vector style ("…style.json"), which
 * becomes a catalog item of its own, or the id of a catalog layer
 * ("<serviceName>:<layerName>"), which lifts an existing layer into the group.
 *
 * The object form adds tools to that layer (addons declared per layer, e.g.
 * "alwaysOnTop"). They are added to whatever the style or the catalog item
 * already declares, they do not replace it.
 */
export type AdditionalLayerRef =
  | string
  | { layer: string; tools?: ToolEntry[] };

/**
 * Configured layers and the subcategory they appear in. The category is
 * mandatory: a layer added into an existing category is not findable, since
 * nothing about it says it was configured rather than delivered.
 */
export type AdditionalLayerGroup = {
  /** subcategory title */
  Title: string;
  /** subcategory id; derived from the Title when omitted */
  id?: string;
  layers: AdditionalLayerRef[];
};

export type AdditionalLayerEntry = AdditionalLayerGroup;

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
   * Layers added to the catalog on top of what the services and the additional
   * config deliver: vector style urls and ids of catalog layers, each group
   * under a Title of its own. They are exempt from `filters`, like dropped
   * layers, since a curated filter config cannot know them.
   */
  additionalLayers?: AdditionalLayerEntry[];
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
