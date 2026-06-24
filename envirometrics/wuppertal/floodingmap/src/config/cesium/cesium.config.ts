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

import { APP_BASE_PATH, HGK_TERRAIN_PROVIDER_URLS } from "../app.config";
export const CESIUM_PATHNAME = "__cesium__";
export const FLOODINGMAP_TILESET_IDS = {
  MESH_2024: "wupp-mesh-2024",
} as const;
export const FLOODINGMAP_TERRAIN_PROVIDER_IDS = {
  TERRAIN_2020: "terrain-2020",
  DSM_MESH_2024_1M: "dsm-mesh-2024-1m",
} as const;

// One Cesium terrain provider per flood-simulation water surface. These are
// toggled at runtime by switching the active scene style (see store.config +
// useFloodingSceneStyleSync) — the scene-style id equals the HGK provider id.
const FLOOD_TERRAIN_PROVIDERS: Record<string, { url: string }> =
  Object.fromEntries(
    Object.entries(HGK_TERRAIN_PROVIDER_URLS).map(([id, url]) => [id, { url }])
  );

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
    terrainProviders: {
      // Base ground (DGM) + surface (DOM/DSM) providers used for marker and
      // selection elevation sampling; not the visible flood surface.
      [FLOODINGMAP_TERRAIN_PROVIDER_IDS.TERRAIN_2020]: WUPP_TERRAIN_PROVIDER,
      [FLOODINGMAP_TERRAIN_PROVIDER_IDS.DSM_MESH_2024_1M]:
        WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
      // Visible, per-simulation flood water surfaces (toggled via scene styles).
      ...FLOOD_TERRAIN_PROVIDERS,
    },
  },
  tilesetConfigs: {
    [FLOODINGMAP_TILESET_IDS.MESH_2024]: WUPP_MESH_2024,
  },
};

const WATER_CESIUM_COLOR_CHANNELS = [0.4, 0.4, 0.85, 0.7] as const;
export const WATER_CESIUM_COLOR = new Color(...WATER_CESIUM_COLOR_CHANNELS);

export const FEATUREINFO_MARKER_HIGHLIGHT_MIN_SHOW_DISTANCE = 90;
export const FEATUREINFO_MARKER_HIGHLIGHT_MAX_WIDTH = 8;
export const FEATUREINFO_MARKER_HIGHLIGHT_HEIGHT = 5000;
