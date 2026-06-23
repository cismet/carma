import { Color } from "@carma-cesium";

import {
  WUPP_MESH_2024,
  WUPP_TERRAIN_PROVIDER,
  WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
} from "@carma-commons/resources";
import {
  type CesiumConfig,
  type CesiumWidgetConstructorOptions,
} from "@carma-mapping/engines/cesium/react/runtime";

import { APP_BASE_PATH } from "../app.config";
export const CESIUM_PATHNAME = "__cesium__";

// disable cesium canvas background transparency
export const CONSTRUCTOR_OPTIONS: CesiumWidgetConstructorOptions = {
  contextOptions: { webgl: { alpha: false } },
};

// see also cesium State in store
export const CESIUM_CONFIG: CesiumConfig = {
  transitions: {
    mapMode: {
      duration: 1000,
    },
  },
  camera: {
    limiter: {
      pitch: {
        enabled: true,
        max: 85,
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
  },
  tilesetConfigs: {
    primary: WUPP_MESH_2024,
  },
};

const WATER_CESIUM_COLOR_CHANNELS = [0.4, 0.4, 0.85, 0.7] as const;
export const WATER_CESIUM_COLOR = new Color(...WATER_CESIUM_COLOR_CHANNELS);

export const FEATUREINFO_MARKER_HIGHLIGHT_MIN_SHOW_DISTANCE = 90;
export const FEATUREINFO_MARKER_HIGHLIGHT_MAX_WIDTH = 8;
export const FEATUREINFO_MARKER_HIGHLIGHT_HEIGHT = 5000;
