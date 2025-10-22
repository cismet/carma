// @ts-nocheck
// TODO fix typescript for strict mode
import {
  BASEMAP_METROPOLE_RUHR_WMTS_GRAUBLAU_HQ,
  WUPP_LOD2_TILESET,
  WUPP_MESH_2020,
  WUPP_MESH_2024,
  WUPP_TERRAIN_PROVIDER,
  WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
  WUPPERTAL,
} from "@carma/resources";

import { Cartesian3, HeadingPitchRange } from "@carma/cesium";
import type { LeafletConfig } from "@carma/types";
import type { CesiumConfig } from "@carma-mapping/engines/cesium/core";
import type { TransitionConfig } from "@carma-mapping/map-transition-2d-3d";
import { COLORS } from "@carma-commons/utils";
import { MODEL_ASSETS } from "./assets.config";
import { ManagedCesiumStyleKeys } from "@carma-appframeworks/portals";

export const APP_BASE_PATH = import.meta.env.BASE_URL;
export const ICON_PREFIX =
  "https://www.wuppertal.de/geoportal/geoportal_icon_legends/";

export const CONFIG_BASE_URL =
  "https://ceepr.cismet.de/config/wuppertal/_dev_geoportal/";

export const MIN_MOBILE_WIDTH = 600;

const CESIUM_PATHNAME = "__cesium__";

/**
 * Complete Cesium configuration for Geoportal
 * Uses new SceneStyleConfig format with sources and styles
 * Style IDs use ManagedCesiumStyleKeys from portals library:
 *   - luftbild (aerial) → ManagedCesiumStyleKeys.MESH
 *   - karte (topo) → ManagedCesiumStyleKeys.LOD2
 */
// Transition configuration for 2D↔3D mode switching
export const TRANSITIONS_CONFIG: TransitionConfig = {
  modeTo3d: {
    step1_prepare2dView: {
      maxZoom: 20,
      zoomOutDurationMs: 700,
      zoomOutTimeoutBufferMs: 100,
    },
    step2_initialRender: {
      timeoutMs: 500,
    },
    step3_waitForResources: {
      timeoutMs: 2000,
    },
    // step4_positionCamera: synchronous, no config needed
    step5_cssFadeIn: {
      durationMs: 1000,
    },
    step6_cameraAnimation: {
      durationMs: 2000,
    },
  },
  modeTo2d: {
    step2_cameraTiltAnimation: {
      durationFactorCameraDeviationMs: 1500,
      durationFactorZoomDiffMs: 500,
      maxDurationMs: 2000,
    },
    step3_cssFadeOut: {
      durationMs: 1000,
    },
  },
};

export const CESIUM_CONFIG: Partial<CesiumConfig> = {
  baseUrl: `${APP_BASE_PATH}${CESIUM_PATHNAME}`,
  screenSpaceCameraController: {
    enableCollisionDetection: false, // Disabled to prevent camera jumps during transitions
    maximumZoomDistance: 50000,
    minimumZoomDistance: 1, // Reduced to allow very close zoom
  },

  // New SceneStyleConfig format with sources and styles
  sceneStyle: {
    sources: {
      imagery: [
        {
          id: "spw2_graublau",
          ...BASEMAP_METROPOLE_RUHR_WMTS_GRAUBLAU_HQ,
        } as any,
      ],
      terrain: [
        { id: "dem-2020", ...WUPP_TERRAIN_PROVIDER },
        { id: "dsm-mesh-2024", ...WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M },
      ],
      tilesets: [
        { id: "wupp-mesh-2024", ...WUPP_MESH_2024 },
        { id: "wupp-mesh-2020", ...WUPP_MESH_2020 },
        { id: "wupp-lod2", ...WUPP_LOD2_TILESET },
      ],
    },

    styles: [
      {
        id: ManagedCesiumStyleKeys.MESH,
        name: "Aerial (Mesh 2024)",
        shadows: false,
        backgroundColor: COLORS.GRAY,
        globe: {
          baseColor: COLORS.NONZERO_TRANSPARENT_WHITE,
        },
        tilesets: [{ id: "wupp-mesh-2024" }],
        terrain: "dem-2020",
      },
      {
        id: ManagedCesiumStyleKeys.LOD2,
        name: "Topographic (LOD2)",
        shadows: false,
        backgroundColor: COLORS.WHITE,
        globe: {
          baseColor: COLORS.WHITE,
        },
        imageryLayers: [{ id: "spw2_graublau", opacity: 1.0 }],
        tilesets: [{ id: "wupp-lod2" }],
        terrain: "dem-2020",
      },
    ],
  },

  modelAssets: MODEL_ASSETS,
};

export const LEAFLET_CONFIG: LeafletConfig = {
  zoomSnap: 1.0,
  zoomDelta: 1.0,
};

// Default 2D map position (for Leaflet, MapLibre)
// Note: NOT yet unified across all engines - see https://github.com/cismet/carma/issues/214
export const DEFAULT_MAP_POSITION = {
  latitude: 51.27174, // WUPPERTAL.position.latitude
  longitude: 7.20028, // WUPPERTAL.position.longitude
  zoom: 15, // Leaflet/MapLibre zoom level
};

// Default Cesium 3D camera location (heading, pitch, range)
export const DEFAULT_CESIUM_CAMERA = {
  latitude: 51.27174, // WUPPERTAL.position.latitude
  longitude: 7.20028, // WUPPERTAL.position.longitude
  altitude: 255, // WUPPERTAL.position.altitude + 100
  heading: 0, // North
  pitch: -0.785, // ~45° down
  range: 600, // Distance from target in meters
};
