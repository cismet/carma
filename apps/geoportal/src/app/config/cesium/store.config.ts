import { Color } from "cesium";

import { CesiumState } from "@carma-mapping/engines/cesium/react/runtime";
import {
  CUSTOM_SHADERS_DEFINITIONS,
  colorToConstructorArgs,
} from "@carma-mapping/engines/cesium/core";

import { MapStyleKeys } from "../../constants/MapStyleKeys";
import {
  CESIUM_IMAGERY_LAYER_IDS,
  CESIUM_TERRAIN_PROVIDER_IDS,
  CESIUM_TILESET_IDS,
} from "../app.config";
import { MODEL_ASSETS } from "./assets.config";

export const defaultCesiumState: CesiumState = {
  currentSceneStyle: MapStyleKeys.TOPO,
  styling: {
    tileset: {
      opacity: 1.0,
    },
  },
  sceneSpaceCameraController: {
    enableCollisionDetection: true,
    maximumZoomDistance: 50000,
    minimumZoomDistance: 100,
  },
  sceneStyles: {
    [MapStyleKeys.AERIAL]: {
      name: "3D-Mesh 03/2024",
      live: {
        scene: {
          backgroundColor: colorToConstructorArgs(Color.GRAY),
        },
        globe: {
          baseColor: [0, 0, 0, 0.01],
          translucency: {
            enabled: true,
            frontFaceAlpha: 0.0,
            backFaceAlpha: 0.0,
          },
        },
      },
      members: {
        terrainProviderId: CESIUM_TERRAIN_PROVIDER_IDS.TERRAIN_2020,
        surfaceProviderId: CESIUM_TERRAIN_PROVIDER_IDS.DSM_MESH_2024_1M,
        tilesets: [
          {
            id: CESIUM_TILESET_IDS.MESH_2024,
            appearance: {
              type: "custom-shader",
              shader: CUSTOM_SHADERS_DEFINITIONS.UNLIT_ENHANCED_2024,
            },
          },
        ],
      },
    },
    [MapStyleKeys.TOPO]: {
      name: "LoD2-Gebäude (NRW)",
      live: {
        scene: {
          backgroundColor: colorToConstructorArgs(Color.WHITE),
        },
        globe: {
          baseColor: colorToConstructorArgs(Color.WHITE),
        },
      },
      members: {
        terrainProviderId: CESIUM_TERRAIN_PROVIDER_IDS.TERRAIN_2020,
        surfaceProviderId: CESIUM_TERRAIN_PROVIDER_IDS.DSM_MESH_2024_1M,
        imageryLayers: [
          { id: CESIUM_IMAGERY_LAYER_IDS.BASEMAP_GRAUBLAU, opacity: 1.0 },
        ],
        tilesets: [{ id: CESIUM_TILESET_IDS.LOD2 }],
      },
    },
  },
  models: MODEL_ASSETS,
};

export default defaultCesiumState;
