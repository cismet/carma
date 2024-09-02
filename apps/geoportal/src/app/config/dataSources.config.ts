import { APP_BASE_PATH } from './app.config';
const GEOJSON_BASE_PATH = `${APP_BASE_PATH}data/geojson/`;
const TILESET_BASE_PATH = `${APP_BASE_PATH}data/tiles/`;

// TODO CONSOLIDATE_CESIUM 

// DATA SOURCES

// TILESETS

export const WUPP3D = {
  url: 'https://wupp-3d-data.cismet.de/mesh/tileset.json',
  translation: {
    x: 7.20009,
    y: 51.272034,
    z: 0,
  },
};

export const WUPP_LOD2_TILESET = {
  url: 'https://wupp-3d-data.cismet.de/lod2/tileset.json',
};

export const WUPP_BAUMKATASTER_TILESET = {
  url: 'https://wupp-3d-data.cismet.de/trees/tileset.json',
};

// EXTERNAL TILESETS

export const CITYGML_TEST_TILESET = {
  url: `${TILESET_BASE_PATH}tileset.json`,
  idProperty:
    'http://repository.gdi-de.org/schemas/adv/citygml/fdv/art.htm#_9100',
};

export const TILESET_BASEMAP_DE = {
  url: 'https://web3d.basemap.de/cesium/buildings-fly/root.json',
};

export const DEFAULT_ID_PROPERTY = 'UUID';

// GEOSJSON SOURCES

export const FOOTPRINT_GEOJSON_SOURCES = {
  VORONOI: {
    url: `${GEOJSON_BASE_PATH}buildings_voronoi_buffered_2m.json`,
    name: 'Voronoi 2m',
    idProperty: 'UUID',
  },
  BUILDINGS: {
    url: `${GEOJSON_BASE_PATH}buildings.json`,
    name: 'Buildings',
    idProperty: 'UUID',
  },
  BUFFERED: {
    url: `${GEOJSON_BASE_PATH}buildings_buffered_1m.json`,
    name: 'Buffered 1m',
    idProperty: 'UUID',
  },
};

// TERRAIN

export const WUPP_TERRAIN_PROVIDER = {
  url: 'https://cesium-wupp-terrain.cismet.de/terrain2020',
};

// IMAGERY WMS

export const DEFAULT_WMS_IMAGE_PROVIDER_PARAMETERS = {
  transparent: true,
  format: 'image/png',
};

export const BASEMAP_BASEMAPDE_WMS_GRAU = {
  url: 'https://sgx.geodatenzentrum.de/wms_basemapde?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities',
  layers: 'de_basemapde_web_raster_grau',
  parameters: DEFAULT_WMS_IMAGE_PROVIDER_PARAMETERS,
};

export const BASEMAP_BASEMAPDE_WMS_FARBE = {
  url: 'https://sgx.geodatenzentrum.de/wms_basemapde?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities',
  layers: 'de_basemapde_web_raster_farbe',
  parameters: DEFAULT_WMS_IMAGE_PROVIDER_PARAMETERS,
};

export const BASEMAP_METROPOLRUHR_WMS_GRUNDRISS = {
  url: 'https://geodaten.metropoleruhr.de/spw2/service',
  layers: 'spw2_light_grundriss',
  parameters: DEFAULT_WMS_IMAGE_PROVIDER_PARAMETERS,
};

export const BASEMAP_METROPOLRUHR_WMS_GRAUBLAU = {
  url: 'https://geodaten.metropoleruhr.de/spw2/service',
  layers: 'spw2_graublau',
  parameters: DEFAULT_WMS_IMAGE_PROVIDER_PARAMETERS,
};

export const BASEMAP_METROPOLRUHR_WMS_EXTRALIGHT = {
  url: 'https://geodaten.metropoleruhr.de/spw2/service',
  layers: 'spw2_extralight',
  parameters: DEFAULT_WMS_IMAGE_PROVIDER_PARAMETERS,
};
// Stadtplanwerk 2
const SPW2_WEBMERCATOR_LAYERS = [
  { id: 'spw2_orange', name: 'SPW2 Orange' },
  { id: 'spw2_light', name: 'SPW2 Light' },
  { id: 'spw2_light_plus', name: 'SPW2 Light Plus' },
  { id: 'spw2_graublau', name: 'SPW2 GrauBlau' },
];

// prepare for direct use with Leaflet without requesting service first
export const METROPOLERUHR_WMTS_SPW2_WEBMERCATOR = {
  serviceUrl:
    'https://geodaten.metropoleruhr.de/spw2?&service=WMTS&request=GetCapabilities',
  type: 'WMTS',
  layers: SPW2_WEBMERCATOR_LAYERS.reduce((acc, { id, name }) => {
    const tileMatrixSet = 'webmercator';
    acc[id] = {
      id,
      name,
      url: `https://geodaten.metropoleruhr.de/spw2/service/wmts?layer=${id}&style=default&tilematrixset=${tileMatrixSet}&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/png&TileMatrix={z}&TileCol={x}&TileRow={y}`,
    };
    return acc;
  }, {}),
};
