import {
  DEFAULT_WMS_IMAGE_PROVIDER_PARAMETERS,
  WMSLayerDetails,
  WMSLayerMap,
} from "../wms";

export const BASEMAP_METROPOLRUHR_WMS_GRUNDRISS = {
  url: "https://geodaten.metropoleruhr.de/spw2/service",
  layers: "spw2_light_grundriss",
  parameters: DEFAULT_WMS_IMAGE_PROVIDER_PARAMETERS,
};

export const BASEMAP_METROPOLRUHR_WMS_GRAUBLAU = {
  url: "https://geodaten.metropoleruhr.de/spw2/service",
  layers: "spw2_graublau",
  parameters: DEFAULT_WMS_IMAGE_PROVIDER_PARAMETERS,
};

export const BASEMAP_METROPOLRUHR_WMS_EXTRALIGHT = {
  url: "https://geodaten.metropoleruhr.de/spw2/service",
  layers: "spw2_extralight",
  parameters: DEFAULT_WMS_IMAGE_PROVIDER_PARAMETERS,
};

// Stadtplanwerk 2
const SPW2_WEBMERCATOR_LAYERS: Omit<WMSLayerDetails, "url">[] = [
  { id: "spw2_orange", name: "SPW2 Orange" },
  { id: "spw2_light", name: "SPW2 Light" },
  { id: "spw2_light_plus", name: "SPW2 Light Plus" },
  { id: "spw2_graublau", name: "SPW2 GrauBlau" },
];

// prepare for direct use with Leaflet without requesting service first
export const METROPOLERUHR_WMTS_SPW2_WEBMERCATOR = {
  serviceUrl:
    "https://geodaten.metropoleruhr.de/spw2?&service=WMTS&request=GetCapabilities",
  type: "WMTS",
  layers: SPW2_WEBMERCATOR_LAYERS.reduce<WMSLayerMap>(
    (acc, { id, name }: Omit<WMSLayerDetails, "url">) => {
      const tileMatrixSet = "webmercator";
      acc[id] = {
        id,
        name,
        url: `https://geodaten.metropoleruhr.de/spw2/service/wmts?layer=${id}&style=default&tilematrixset=${tileMatrixSet}&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/png&TileMatrix={z}&TileCol={x}&TileRow={y}`,
      };
      return acc;
    },
    {},
  ),
};
