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

import { Cartesian3, toColorRgbaArray, Color, HeadingPitchRange } from "@carma/cesium";
import type { LeafletConfig } from "@carma/types";
import type { CesiumConfig } from "@carma-mapping/engines/cesium/core";
import { MODEL_ASSETS } from "./assets.config";

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
 * Maps 2D basemap styles to 3D scene styles:
 *   - luftbild (aerial) → mesh-2024
 *   - karte (topo) → lod2
 */
export const CESIUM_CONFIG: Partial<CesiumConfig> = {
  baseUrl: `${APP_BASE_PATH}${CESIUM_PATHNAME}`,
  
  // Transition configuration for 2D↔3D mode switching
  transitions: {
    modeTo3d: {
      step1_prepare2dView: {
        maxZoom: 20,
        zoomOutDuration: 700,
      },
      step2_cameraAnimation: {
        duration: 1000,
      },
    },
    modeTo2d: {
      durationFactorCameraDeviation: 2,
      durationFactorZoomDiff: 1,
      maxDuration: 5,
    },
  },
  
  // Initial camera using HeadingPitchRange (target-centric)
  initialCamera: {
    target: Cartesian3.fromDegrees(
      WUPPERTAL.position.longitude,
      WUPPERTAL.position.latitude,
      WUPPERTAL.position.altitude
    ),
    orientation: {
      heading: 0, // North
      pitch: -0.785, // ~45° down
      range: 600, // Distance from target
    } as HeadingPitchRange,
  },
  
  screenSpaceCameraController: {
    enableCollisionDetection: true,
    maximumZoomDistance: 50000,
    minimumZoomDistance: 100,
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
        id: "mesh-2024",
        name: "Aerial (Mesh 2024)",
        shadows: false,
        backgroundColor: toColorRgbaArray(Color.GRAY),
        globe: {
          baseColor: [0, 0, 0, 1 / 255], // Nearly transparent
        },
        tilesets: [{ id: "wupp-mesh-2024" }],
        terrain: "dem-2020",
      },
      {
        id: "lod2",
        name: "Topographic (LOD2)",
        shadows: false,
        backgroundColor: toColorRgbaArray(Color.WHITE),
        globe: {
          baseColor: toColorRgbaArray(Color.WHITE),
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

export const VIEWERSTATE_KEYS = {
  mapStyle: "m",
  is3d: "is3d",
};
