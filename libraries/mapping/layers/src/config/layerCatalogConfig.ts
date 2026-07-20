import type { LayerConfig } from "../lib/contracts/carma-layers.d";
import type { DiscoverProps } from "../helper/discover";
import type { CatalogFilters } from "../helper/catalogFilter";
import { serviceConfig } from "../helper/config";
import { ASSET_BASE_URL } from "../helper/assetUrls";

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
