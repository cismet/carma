import {
  wuppDiscoverProps,
  wuppLayerCatalogConfig,
  type DiscoverProps,
  type LayerCatalogConfig,
} from "@carma-mapping/layers";

export const apiUrl =
  import.meta.env.VITE_DISCOVER_API_URL || "https://wunda-cloud-api.cismet.de";

export const discoverProps: DiscoverProps = {
  ...wuppDiscoverProps,
  apiUrl,
};

export const layerCatalogConfig: LayerCatalogConfig = {
  ...wuppLayerCatalogConfig,
  discoverProps,
};
