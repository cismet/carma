import { Color, Viewer } from "cesium";
import {
  WUPP_MESH_2024,
  WUPP_TERRAIN_PROVIDER,
  WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
} from "@carma/resources";
import type { CesiumConfigSnapshot } from "../../lib/types/CesiumConfig.snapshot";

import { APP_BASE_PATH } from "../app.config";

export const CESIUM_PATHNAME = "__cesium__";

// disable cesium canvas background transparency
export const CONSTRUCTOR_OPTIONS: Viewer.ConstructorOptions = {
  contextOptions: { webgl: { alpha: false } },
};

// see also cesium State in store
export const CESIUM_CONFIG: CesiumConfigSnapshot = {
  transitions: {
    mapMode: {
      duration: 1000,
    },
  },
  camera: {
    minPitch: 5,
    minPitchRange: 10,
  },
  markerKey: "MarkerGlowLine",
  markerAnchorHeight: 10,
  baseUrl: `${APP_BASE_PATH}${CESIUM_PATHNAME}`,
  pathName: CESIUM_PATHNAME,
  providerConfig: {
    terrainProvider: { url: WUPP_TERRAIN_PROVIDER.url },
    surfaceProvider: { url: WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M.url },
  },
  tilesetConfigs: {
    primary: WUPP_MESH_2024,
  },
} as any;

export const WATER_CESIUM_COLOR = new Color(0.4, 0.4, 0.85, 0.7);

export const FEATUREINFO_MARKER_HIGHLIGHT_MIN_SHOW_DISTANCE = 90;
export const FEATUREINFO_MARKER_HIGHLIGHT_MAX_WIDTH = 8;
export const FEATUREINFO_MARKER_HIGHLIGHT_HEIGHT = 5000;
