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
export type {
  TextureColorCorrection,
  TilesetConfig,
} from "./lib/base/tilesets";
export { rasterDemTerrainTileUrl } from "./lib/base/terrain";
export type { RasterDemTerrainResource } from "./lib/base/terrain";
export type {
  GeoreferencedLandmark,
  LandmarkSilhouettePart,
} from "./lib/base/landmarks";
export { DEFAULT_WMS_IMAGE_PROVIDER_PARAMETERS } from "./lib/base/wms";

export { TILESET_BASEMAP_DE } from "./lib/de/tileset3d.ts";
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
export {
  LANGENBERG_LANDMARKS,
  LANGENBERG_LANDMARK_PROVENANCE,
} from "./lib/de.nrw.ruhr/landmarks";
export {
  NORDHELLE_LANDMARKS,
  NORDHELLE_LANDMARK_PROVENANCE,
} from "./lib/de.nrw.sauerland/landmarks";
export { BRUECKENENTWURF_GLB } from "./lib/de.nrw.wuppertal/models";
export {
  WUPPERTAL_CAMERA_FLIGHTS,
  WUPPERTAL_CAMERA_CORRIDORS,
  WUPPERTAL_HKW_CHIMNEY,
} from "./lib/de.nrw.wuppertal/camera-flights";
export { FESTPUNKTE_WUPPERTAL } from "./lib/de.nrw.wuppertal/festpunkte";
export {
  OBLIQUE_2024_EXT_ORI_UTM32_URI,
  OBLIQUE_2024_FPRFC_GEOJSON_URI,
  OBLIQUE_2024_ORIENTATIONS_CRS,
  OBLIQUE_2024_PREVIEW_PATH,
} from "./lib/de.nrw.wuppertal/oblique";
export { WUPPERTAL } from "./lib/de.nrw.wuppertal/positions";
export {
  NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN,
  NRW_DOM1_DHHN2016_TERRARIUM_TERRAIN,
  WUPP_TERRAIN_PROVIDER,
  WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
} from "./lib/de.nrw.wuppertal/terrain";
export {
  WUPP_BAUMKATASTER_TILESET,
  WUPP_LOD2_TILESET,
  WUPP_MESH_2020,
  WUPP_MESH_2024,
  WUPP_MESH_2024_ROOT_REFERENCE,
} from "./lib/de.nrw.wuppertal/tileset3d";
