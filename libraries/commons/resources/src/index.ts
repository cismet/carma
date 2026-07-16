export {
  createConfig,
  createConfigWithoutCRS,
  createGazEndpointUri,
  createGazEndpointUriWithoutCRS,
  DEFAULT_GAZ_SOURCES,
  DEFAULT_HOST,
  DEFAULT_NRW_PROJ,
  DEFAULT_PROJ,
  defaultGazDataConfig,
  ENDPOINT,
  gazDataPrefix,
  isAreaType,
  isAreaTypeWithGEP,
  isEndpoint,
  NAMED_CATEGORIES,
} from "./lib/base/endpoints";
export type { NamedCategory } from "./lib/base/endpoints";
export { serviceOptions } from "./lib/base/service-options";
export { ContentType, TilesetType } from "./lib/base/tilesets";
export type { TilesetConfig } from "./lib/base/tilesets";
export { DEFAULT_WMS_IMAGE_PROVIDER_PARAMETERS } from "./lib/base/wms";

export { GCG2016_PROVENANCE, GCG2016_TILE_LOADERS } from "./lib/de/gcg2016";
export { TILESET_BASEMAP_DE } from "./lib/de/tileset3d";
export {
  BASEMAP_BASEMAPDE_WMS_FARBE,
  BASEMAP_BASEMAPDE_WMS_GRAU,
} from "./lib/de/wms";

export {
  BASEMAP_METROPOLE_RUHR_WMS_GRAUBLAU,
  BASEMAP_METROPOLE_RUHR_WMTS_GRAUBLAU_HQ,
  BASEMAP_METROPOLRUHR_WMS_EXTRALIGHT,
  BASEMAP_METROPOLRUHR_WMS_GRUNDRISS,
  BASEMAP_METROPOLRUHR_WMTS_GRAUBLAU,
  METROPOLERUHR_WMTS_SPW2_WEBMERCATOR,
  METROPOLERUHR_WMTS_SPW2_WEBMERCATOR_HQ,
} from "./lib/de.nrw.ruhr/wms";
export { FESTPUNKTE_WUPPERTAL } from "./lib/de.nrw.wuppertal/festpunkte";
export { BRUECKENENTWURF_GLB } from "./lib/de.nrw.wuppertal/models";
export {
  OBLIQUE_2024_EXT_ORI_UTM32_URI,
  OBLIQUE_2024_FPRFC_GEOJSON_URI,
  OBLIQUE_2024_ORIENTATIONS_CRS,
  OBLIQUE_2024_PREVIEW_PATH,
} from "./lib/de.nrw.wuppertal/oblique";
export { WUPPERTAL } from "./lib/de.nrw.wuppertal/positions";
export {
  WUPP_TERRAIN_PROVIDER,
  WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
} from "./lib/de.nrw.wuppertal/terrain";
export {
  WUPP_BAUMKATASTER_TILESET,
  WUPP_LOD2_TILESET,
  WUPP_MESH_2020,
  WUPP_MESH_2024,
} from "./lib/de.nrw.wuppertal/tileset3d";
