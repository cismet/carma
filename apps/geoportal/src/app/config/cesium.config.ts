import type { CesiumConfig } from "@carma/cesium/types";
import { COLORS } from "@carma/commons/utils";
import {
  BASEMAP_METROPOLE_RUHR_WMTS_GRAUBLAU_HQ,
  WUPP_LOD2_TILESET,
  WUPP_MESH_2020,
  WUPP_MESH_2024,
  WUPP_TERRAIN_PROVIDER,
  WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
} from "@carma/resources";

/**
 * Geoportal-specific Cesium scene style identifiers
 * These are used in the Cesium config and mapped to portal map styles
 */
export const GeoportalCesiumStyleKeys = {
  LOD2: "lod2",
  MESH: "mesh-2024",
} as const;

const CESIUM_PATHNAME = "__cesium__";

const APP_BASE_PATH = import.meta.env.BASE_URL;

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
        } as any, // Type assertion needed - resource configs are compatible but types are strict
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
        id: GeoportalCesiumStyleKeys.MESH,
        name: "Aerial (Mesh 2024)",
        shadows: false,
        backgroundColor: COLORS.GRAY,
        globe: {
          //baseColor: COLORS.NONZERO_TRANSPARENT_WHITE,
          baseColor: COLORS.GRAY,
          showSkirts: false,
          shadows: 0, // shadowmode disabled
          preloadSiblings: true,
          prelaodAncestors: true,
        },
        tilesets: [{ id: "wupp-mesh-2024" }],
        //terrain: "dem-2020",
      },
      {
        id: GeoportalCesiumStyleKeys.LOD2,
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

  //modelAssets: MODEL_ASSETS,
};
