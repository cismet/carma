import { Color } from "cesium";

import {
  type CesiumState,
  type SceneStyle,
} from "@carma-mapping/engines/cesium/react/runtime";
import {
  CUSTOM_SHADERS_DEFINITIONS,
  colorToConstructorArgs,
} from "@carma-mapping/engines/cesium/core";

import { HGK_KEYS } from "../app.config";
import { MODEL_ASSETS } from "./assets.config";
import {
  FLOODINGMAP_TERRAIN_PROVIDER_IDS,
  FLOODINGMAP_TILESET_IDS,
  WATER_CESIUM_COLOR,
} from "./cesium.config";

// Shared look for flood scene styles: translucent water globe with the mesh drawn on top (depth test off).
const FLOOD_STYLE_LIVE = {
  scene: {
    backgroundColor: colorToConstructorArgs(Color.DIMGREY),
  },
  globe: {
    baseColor: colorToConstructorArgs(WATER_CESIUM_COLOR),
    depthTestAgainstTerrain: false,
    translucency: {
      enabled: true,
      frontFaceAlpha: 1.0,
      backFaceAlpha: 1.0,
    },
  },
} as const;

const FLOOD_STYLE_TILESETS = [
  {
    id: FLOODINGMAP_TILESET_IDS.MESH_2024,
    appearance: {
      type: "custom-shader",
      shader: CUSTOM_SHADERS_DEFINITIONS.UNLIT_ENHANCED_2024,
    },
  },
] as const;

/** Build a flood scene style for a given flood water-surface terrain provider. */
export const createFloodingSceneStyle = (
  terrainProviderId: string
): SceneStyle => ({
  name: terrainProviderId,
  live: FLOOD_STYLE_LIVE,
  members: {
    terrainProviderId,
    surfaceProviderId: FLOODINGMAP_TERRAIN_PROVIDER_IDS.DSM_MESH_2024_1M,
    tilesets: FLOOD_STYLE_TILESETS,
  },
});

// Initial flood surface: simulation 0 + HW-Schutz on (matches App.tsx default).
const DEFAULT_TERRAIN_PROVIDER_ID = HGK_KEYS[0].hws;

export const defaultCesiumState: CesiumState = {
  currentSceneStyle: DEFAULT_TERRAIN_PROVIDER_ID,
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
  // One registered style for first paint; later selections create ad-hoc styles via createFloodingSceneStyle.
  sceneStyles: {
    [DEFAULT_TERRAIN_PROVIDER_ID]: createFloodingSceneStyle(
      DEFAULT_TERRAIN_PROVIDER_ID
    ),
  },
  models: MODEL_ASSETS,
};

export default defaultCesiumState;
