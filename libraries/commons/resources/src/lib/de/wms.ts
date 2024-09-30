import { DEFAULT_WMS_IMAGE_PROVIDER_PARAMETERS } from "../wms";

export const BASEMAP_BASEMAPDE_WMS_GRAU = {
  url: "https://sgx.geodatenzentrum.de/wms_basemapde?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities",
  layers: "de_basemapde_web_raster_grau",
  parameters: DEFAULT_WMS_IMAGE_PROVIDER_PARAMETERS,
};

export const BASEMAP_BASEMAPDE_WMS_FARBE = {
  url: "https://sgx.geodatenzentrum.de/wms_basemapde?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities",
  layers: "de_basemapde_web_raster_farbe",
  parameters: DEFAULT_WMS_IMAGE_PROVIDER_PARAMETERS,
};
