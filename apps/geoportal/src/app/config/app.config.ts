import {
  BASEMAP_METROPOLE_RUHR_WMTS_GRAUBLAU_HQ,
  BRUECKENENTWURF_GLB,
  WUPP_LOD2_TILESET,
  WUPP_MESH_2024,
  WUPP_TERRAIN_PROVIDER,
  WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
  WUPPERTAL,
} from "@carma-commons/resources";

import { Cartesian3, Color } from "cesium";
import type { CesiumConfig } from "@carma-mapping/engines/cesium";
import { toColorRgbaArray } from "@carma-mapping/engines/cesium";
import type { LeafletConfig } from "@carma/types";
import { MODEL_ASSETS } from "./cesium/assets.config";

export const APP_BASE_PATH = import.meta.env.BASE_URL;
export const ICON_PREFIX =
  "https://www.wuppertal.de/geoportal/geoportal_icon_legends/";

export const CONFIG_BASE_URL =
  "https://ceepr.cismet.de/config/wuppertal/_dev_geoportal/";

export const MIN_MOBILE_WIDTH = 600;

const CESIUM_PATHNAME = "__cesium__";

/**
 * Complete Cesium configuration for Geoportal
 * Includes provider config, tilesets, camera settings, and initialization values
 */
export const CESIUM_CONFIG: CesiumConfig = {
  transitions: {
    mapMode: {
      duration: 1000,
    },
  },
  camera: {
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
    imageryProvider: BASEMAP_METROPOLE_RUHR_WMTS_GRAUBLAU_HQ,
  },
  tilesetConfigs: {
    primary: WUPP_MESH_2024,
    secondary: WUPP_LOD2_TILESET,
  },
  tilesetVisibility: {
    primary: false,
    secondary: true,
  },
  tilesetOpacity: {
    primary: 1.0,
    secondary: 1.0,
  },
  models: [BRUECKENENTWURF_GLB],
  // Initialization values for CesiumContextProvider
  homePosition: Cartesian3.fromDegrees(
    WUPPERTAL.position.longitude,
    WUPPERTAL.position.latitude,
    WUPPERTAL.position.altitude
  ),
  homeOffset: {
    x: 0,
    y: -50000, // southwards
    z: 45000, // elevation
  },
  cameraController: {
    enableCollisionDetection: true,
    maximumZoomDistance: 50000,
    minimumZoomDistance: 100,
  },
  sceneStyles: {
    primary: {
      backgroundColor: toColorRgbaArray(Color.GRAY),
      globe: {
        baseColor: [0, 0, 0, 0.01],
      },
    },
    secondary: {
      backgroundColor: toColorRgbaArray(Color.WHITE),
      globe: {
        baseColor: toColorRgbaArray(Color.WHITE),
      },
    },
  },
  modelAssets: MODEL_ASSETS,
};

export const LEAFLET_CONFIG: LeafletConfig = {
  zoomSnap: 1.0,
  zoomDelta: 1.0,
};
