// @ts-nocheck
// TODO fix typescript for strict mode
import {
  BASEMAP_METROPOLE_RUHR_WMTS_GRAUBLAU_HQ,
  BRUECKENENTWURF_GLB,
  WUPP_LOD2_TILESET,
  WUPP_MESH_2020,
  WUPP_MESH_2024,
  WUPP_TERRAIN_PROVIDER,
  WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
  WUPPERTAL,
} from "@carma/resources";

import { Cartesian3, toColorRgbaArray, Color } from "@carma/cesium";
import type { LeafletConfig, CesiumConfig } from "@carma/types";
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
  imageryProviders: [
    {
      config: BASEMAP_METROPOLE_RUHR_WMTS_GRAUBLAU_HQ,
    },
  ],
  terrainProviders: [
    { key: "terrain", config: WUPP_TERRAIN_PROVIDER },
    {
      key: "dsm_mesh_2024",
      config: WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
    },
  ],
  tilesets: [
    { config: WUPP_LOD2_TILESET },
    { config: WUPP_MESH_2024 },
    { config: WUPP_MESH_2020 },
  ],
  sceneStyles: [
    {
      key: "mesh_2024",
      name: "Aerial (Mesh 2024)",
      type: "aerial",
      backgroundColor: toColorRgbaArray(Color.GRAY),
      globe: {
        baseColor: [0, 0, 0, 0.01],
      },
      tilesets: [{ id: "wupp-mesh-2024" }],
    },
    {
      key: "lod2",
      name: "Topographic (LOD 2)",
      type: "lod2",
      backgroundColor: toColorRgbaArray(Color.WHITE),
      globe: {
        baseColor: toColorRgbaArray(Color.WHITE),
      },
      imageryLayers: [{ layer: "spw2_graublau", opacity: 0.5 }],
      tilesets: [{ id: "wupp-lod2" }],
      terrainLayer: "terrain",
    },
    {
      key: "aerial",
      name: "Aerial (Mesh 2020)",
      type: "aerial",
      backgroundColor: toColorRgbaArray(Color.GRAY),
      globe: {
        baseColor: [0, 0, 0, 0.01],
      },
      tilesets: [{ id: "wupp-mesh-2020" }],
    },
  ],
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
