import { Color } from "cesium";

import { CesiumState } from "@carma-mapping/engines/cesium/react/runtime";
import {
  CUSTOM_SHADERS_DEFINITIONS,
  colorToConstructorArgs,
} from "@carma-mapping/engines/cesium/core";

import { MODEL_ASSETS } from "./assets.config";
import {
  FLOODINGMAP_TERRAIN_PROVIDER_IDS,
  FLOODINGMAP_TILESET_IDS,
} from "./cesium.config";

const FLOODINGMAP_SCENE_STYLE_IDS = {
  MESH_2024: "mesh-2024",
  MESH_2020: "mesh-2020",
} as const;

export const defaultCesiumState: CesiumState = {
  currentSceneStyle: FLOODINGMAP_SCENE_STYLE_IDS.MESH_2024,
  styling: {
    tileset: {
      opacity: 1.0,
    },
  },
  sceneSpaceCameraController: {
    enableCollisionDetection: true,
    maximumZoomDistance: 50000,
    minimumZoomDistance: 25,
  },
  sceneStyles: {
    [FLOODINGMAP_SCENE_STYLE_IDS.MESH_2024]: {
      name: "3D-Mesh 03/2024",
      live: {
        scene: {
          backgroundColor: colorToConstructorArgs(Color.GRAY),
        },
        globe: {
          baseColor: [0, 0, 0, 0.01],
        },
      },
      members: {
        terrainProviderId: FLOODINGMAP_TERRAIN_PROVIDER_IDS.TERRAIN_2020,
        surfaceProviderId: FLOODINGMAP_TERRAIN_PROVIDER_IDS.DSM_MESH_2024_1M,
        tilesets: [
          {
            id: FLOODINGMAP_TILESET_IDS.MESH_2024,
            appearance: {
              type: "custom-shader",
              shader: CUSTOM_SHADERS_DEFINITIONS.UNLIT_ENHANCED_2024,
            },
          },
        ],
      },
    },
    [FLOODINGMAP_SCENE_STYLE_IDS.MESH_2020]: {
      name: "3D-Mesh 2020",
      live: {
        scene: {
          backgroundColor: colorToConstructorArgs(Color.GRAY),
        },
        globe: {
          baseColor: [0, 0, 0, 0.01],
        },
      },
      members: {
        terrainProviderId: FLOODINGMAP_TERRAIN_PROVIDER_IDS.TERRAIN_2020,
        surfaceProviderId: FLOODINGMAP_TERRAIN_PROVIDER_IDS.TERRAIN_2020,
        tilesets: [
          {
            id: FLOODINGMAP_TILESET_IDS.MESH_2020,
            appearance: {
              type: "custom-shader",
              shader: CUSTOM_SHADERS_DEFINITIONS.UNLIT_ENHANCED_2020,
            },
          },
        ],
      },
    },
  },
  models: MODEL_ASSETS,
};

export default defaultCesiumState;
