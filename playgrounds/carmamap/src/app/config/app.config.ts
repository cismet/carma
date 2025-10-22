import {
  BASEMAP_METROPOLE_RUHR_WMS_GRAUBLAU,
  WUPP_LOD2_TILESET,
  WUPP_MESH_2024,
  WUPP_TERRAIN_PROVIDER,
  WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
} from "@carma/resources";
// TODO: Remove CesiumConfig import - not available in current version
// import { CesiumConfig } from "@carma-mapping/engines/cesium/core";
import type { LeafletConfig } from "@carma/types";

export const APP_BASE_PATH = import.meta.env.BASE_URL;

const CESIUM_PATHNAME = "__cesium__";

// TODO: Replace with proper CesiumConfig when available
export const CESIUM_CONFIG = {
  transitions: {
    mapMode: {
      duration: 1000,
    },
  },
  camera: {
    maxHeight: 100000,
    minHeight: 1,
    minPitch: 15,
    minPitchRange: 10,
  },
  markerKey: "MarkerGlowLine",
  markerAnchorHeight: 10,
  baseUrl: `${APP_BASE_PATH}${CESIUM_PATHNAME}`,
  pathName: CESIUM_PATHNAME,
  providerConfig: {
    terrainProvider: WUPP_TERRAIN_PROVIDER,
    surfaceProvider: WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
    imageryProvider: BASEMAP_METROPOLE_RUHR_WMS_GRAUBLAU,
  },
  tilesetConfigs: {
    primary: WUPP_MESH_2024,
    secondary: WUPP_LOD2_TILESET,
  },
};

export const LEAFLET_CONFIG: LeafletConfig = {
  zoomSnap: 1.0,
  zoomDelta: 1.0,
};

// Default map position for 2D view (Wuppertal, Germany)
export const DEFAULT_MAP_POSITION = {
  latitude: 51.256,
  longitude: 7.15,
  zoom: 13,
};

// Default camera position for 3D view
export const DEFAULT_CESIUM_CAMERA = {
  latitude: 51.256,
  longitude: 7.15,
  altitude: 1000,
  heading: 0,
  pitch: -45,
  range: 1000,
};
