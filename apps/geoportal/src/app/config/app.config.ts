import {
  BASEMAP_METROPOLE_RUHR_WMTS_GRAUBLAU_HQ,
  WUPP_LOD2_TILESET,
  WUPP_MESH_2024,
  WUPP_TERRAIN_PROVIDER,
  WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
} from "@carma-commons/resources";

import type { CesiumConfig } from "@carma-mapping/engines/cesium/legacy";
import type { LeafletConfig } from "@carma-mapping/engines/leaflet";
import {
  CARMA_ZOOM_DEFAULTS,
  type CarmaZoomDefaults,
  getMaplibreZoomFromSourceZoom,
  getMaplibreZoomRangeFromSourceZoomRange,
} from "@carma-appframeworks/portals";
import { getZoomConventionTileSize } from "@carma-geo/utils";
import { Rectangle } from "cesium";

export const APP_BASE_PATH = import.meta.env.BASE_URL;
export const ICON_PREFIX =
  "https://www.wuppertal.de/geoportal/geoportal_icon_legends/";

export const CONFIG_BASE_URL =
  "https://ceepr.cismet.de/config/wuppertal/_dev_geoportal/";

export const MIN_MOBILE_WIDTH = 600;
export const DEFAULT_CAMERA_FOV_DEG = 60;

const CESIUM_PATHNAME = "__cesium__";
const METROPOLE_RUHR_GRAUBLAU_RECTANGLE = Rectangle.fromDegrees(4, 48, 10, 52);

export const CESIUM_CONFIG: CesiumConfig = {
  transitions: {
    mapMode: {
      duration: 1000,
    },
  },
  camera: {
    pitchLimiter: true,
    maxPitchDeg: 75,
    maxPitchCorrectionRangeDeg: 10,
  },
  markerKey: "MarkerGlowLine",
  markerAnchorHeight: 10,
  baseUrl: `${APP_BASE_PATH}${CESIUM_PATHNAME}`,
  pathName: CESIUM_PATHNAME,
  providerConfig: {
    terrainProvider: WUPP_TERRAIN_PROVIDER,
    surfaceProvider: WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
    imageryProvider: {
      ...BASEMAP_METROPOLE_RUHR_WMTS_GRAUBLAU_HQ,
      rectangle: METROPOLE_RUHR_GRAUBLAU_RECTANGLE,
    },
  },
  tilesetConfigs: {
    primary: WUPP_MESH_2024,
    secondary: WUPP_LOD2_TILESET,
  },
};

export const GEOPORTAL_ZOOM_DEFAULTS = {
  tileSize: CARMA_ZOOM_DEFAULTS.tileSize,
  maplibreZoom: CARMA_ZOOM_DEFAULTS.maplibreZoom,
  zoomMin: CARMA_ZOOM_DEFAULTS.zoomMin,
  zoomMax: CARMA_ZOOM_DEFAULTS.zoomMax,
  zoomDefault: CARMA_ZOOM_DEFAULTS.zoomDefault,
  featureInfoZoomDefault: CARMA_ZOOM_DEFAULTS.featureInfoZoomDefault,
  defaultMaxNativeZoom: CARMA_ZOOM_DEFAULTS.defaultMaxNativeZoom,
  shareZoomDefault: CARMA_ZOOM_DEFAULTS.shareZoomDefault,
  selectionFitBoundsMaxZoom: CARMA_ZOOM_DEFAULTS.selectionFitBoundsMaxZoom,
} as const satisfies CarmaZoomDefaults;

export const GEOPORTAL_LEAFLET_MAP_OPTIONS: LeafletConfig = {
  tileSize: getZoomConventionTileSize(GEOPORTAL_ZOOM_DEFAULTS),
  zoomMin: GEOPORTAL_ZOOM_DEFAULTS.zoomMin,
  zoomMax: GEOPORTAL_ZOOM_DEFAULTS.zoomMax,
  zoomSnap: 1.0,
  zoomDelta: 1.0,
};

export const GEOPORTAL_MAPLIBRE_MAP_OPTIONS = {
  tileSize: getZoomConventionTileSize(GEOPORTAL_ZOOM_DEFAULTS.maplibreZoom),
  ...getMaplibreZoomRangeFromSourceZoomRange(
    GEOPORTAL_ZOOM_DEFAULTS,
    GEOPORTAL_ZOOM_DEFAULTS
  ),
  zoomDefault: getMaplibreZoomFromSourceZoom(
    GEOPORTAL_ZOOM_DEFAULTS.zoomDefault,
    GEOPORTAL_ZOOM_DEFAULTS
  ),
} as const;

export const GEOPORTAL_MAPLIBRE_SOURCE_OPTIONS = {
  raster: {
    tileSize: getZoomConventionTileSize(GEOPORTAL_ZOOM_DEFAULTS),
  },
  terrain: {
    tileSize: GEOPORTAL_MAPLIBRE_MAP_OPTIONS.tileSize,
    maxZoom: 15,
  },
} as const;

export const GEOPORTAL_LAYER_SELECTION_DEFAULTS = {
  maxSelectionCount: 10,
} as const;

// URL hash parameter keys for viewer state
export const URL_PARAM_KEYS = {
  mapStyle: "m",
} as const;
