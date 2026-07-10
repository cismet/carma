import type { LayerConfig } from "../lib/contracts/carma-layers.d";
import type { DiscoverProps } from "../helper/discover";
import type { CatalogFilterGroup } from "../helper/catalogFilter";
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
  /** filter dropdown sections; omit for defaultCatalogFilterGroups */
  filterGroups?: CatalogFilterGroup[];
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
