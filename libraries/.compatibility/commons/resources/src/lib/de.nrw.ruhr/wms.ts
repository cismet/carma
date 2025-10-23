import {
  DEFAULT_WMS_IMAGE_PROVIDER_PARAMETERS,
  WMSLayerDetails,
  WMSLayerMap,
} from "../wms";

const SPW2_WMTS_TILEMATRIX_LABELS = [
  "00",
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
];

export const BASEMAP_METROPOLRUHR_WMS_GRUNDRISS = {
  url: "https://geodaten.metropoleruhr.de/spw2/service",
  layers: "spw2_light_grundriss",
  parameters: DEFAULT_WMS_IMAGE_PROVIDER_PARAMETERS,
};

export const BASEMAP_METROPOLE_RUHR_WMS_GRAUBLAU = {
  url: "https://geodaten.metropoleruhr.de/spw2/service",
  layers: "spw2_graublau",
  parameters: DEFAULT_WMS_IMAGE_PROVIDER_PARAMETERS,
};

export const BASEMAP_METROPOLRUHR_WMTS_GRAUBLAU = {
  url: "https://geodaten.metropoleruhr.de/spw2/service",
  layer: "spw2_graublau",
  style: "default",
  format: "image/png",
  tileMatrixSetID: "webmercator",
  tileMatrixLabels: SPW2_WMTS_TILEMATRIX_LABELS,
  minimumLevel: 0,
  maximumLevel: 20,
};

export const BASEMAP_METROPOLE_RUHR_WMTS_GRAUBLAU_HQ = {
  url: "https://geodaten.metropoleruhr.de/spw2/service",
  layer: "spw2_graublau",
  style: "default",
  format: "image/png",
  tileMatrixSetID: "webmercator_hq",
  tileMatrixLabels: SPW2_WMTS_TILEMATRIX_LABELS,
  minimumLevel: 0, // limiting here makes app behave way too slow
  maximumLevel: 20, // as in Capabilities
};

export const BASEMAP_METROPOLRUHR_WMS_EXTRALIGHT = {
  url: "https://geodaten.metropoleruhr.de/spw2/service",
  layers: "spw2_extralight",
  parameters: DEFAULT_WMS_IMAGE_PROVIDER_PARAMETERS,
};

// Stadtplanwerk 2
// only these layers provide a web mercator tile matrix set
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
    {}
  ),
};

export const METROPOLERUHR_WMTS_SPW2_WEBMERCATOR_HQ = {
  serviceUrl:
    "https://geodaten.metropoleruhr.de/spw2?&service=WMTS&request=GetCapabilities",
  type: "WMTS",
  layers: SPW2_WEBMERCATOR_LAYERS.reduce<WMSLayerMap>(
    (acc, { id, name }: Omit<WMSLayerDetails, "url">) => {
      acc[id] = {
        id,
        name,
        url: `https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${id}&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`,
      };
      return acc;
    },
    {}
  ),
};
