import {
  BASEMAP_METROPOLE_RUHR_WMTS_GRAUBLAU_HQ,
  WUPP_LOD2_TILESET,
  WUPP_MESH_2024,
  WUPP_TERRAIN_PROVIDER,
  WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
} from "@carma-commons/resources";

import type { CesiumConfig } from "@carma-mapping/engines/cesium/legacy";
import type { LeafletConfig } from "@carma-mapping/engines/leaflet";
import { Easing, type Easing as EasingFunction } from "@carma-commons/math";
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

type CesiumCameraLimiterReenableOptions = {
  pitch: {
    durationSeconds: number;
    validRangeBufferRadians: number;
  };
  travelZoom: {
    durationMilliseconds: number;
    easing: EasingFunction;
    minHeightBufferMeters: number;
    minViewAxisVerticalRatio: number;
  };
};

type GeoportalCesiumConfig = Omit<CesiumConfig, "camera"> & {
  camera: CesiumConfig["camera"] & {
    limiterReenable: CesiumCameraLimiterReenableOptions;
  };
};

export const CESIUM_CONFIG: GeoportalCesiumConfig = {
  transitions: {
    mapMode: {
      duration: 1000,
    },
  },
  camera: {
    pitchLimiter: true,
    maxPitchDeg: 75,
    maxPitchCorrectionRangeDeg: 10,
    limiterReenable: {
      pitch: {
        durationSeconds: 0.8,
        validRangeBufferRadians: Math.PI / 360,
      },
      travelZoom: {
        durationMilliseconds: 1500,
        easing: Easing.CUBIC_IN_OUT,
        minHeightBufferMeters: 5,
        minViewAxisVerticalRatio: 0.15,
      },
    },
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

export const LEAFLET_CONFIG: LeafletConfig = {
  zoomSnap: 1.0,
  zoomDelta: 1.0,
};

// URL hash parameter keys for viewer state
export const URL_PARAM_KEYS = {
  mapStyle: "m",
  measurements3d: "mm",
} as const;
