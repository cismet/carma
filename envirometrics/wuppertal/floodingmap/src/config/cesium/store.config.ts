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
  FLOOD_TERRAIN_PROVIDER_IDS,
  FLOODINGMAP_TERRAIN_PROVIDER_IDS,
  FLOODINGMAP_TILESET_IDS,
  WATER_CESIUM_COLOR,
} from "./cesium.config";

// Human-readable labels for the flood-simulation scene styles, keyed by the
// HGK terrain-provider id (= scene-style id).
const FLOOD_STYLE_LABELS: Record<string, string> = {
  "HQ10-50": "HQ 10-50 (mit HW-Schutz)",
  HQ100: "HQ 100 (mit HW-Schutz)",
  HQ500: "HQ 500 (Extremereignis)",
  "HQ10-50_noHWS": "HQ 10-50 (ohne HW-Schutz)",
  HQ100_noHWS: "HQ 100 (ohne HW-Schutz)",
};

// Shared look + members for every flood style. Only the terrain provider — the
// visible flood water surface — differs between styles; that is the toggled
// elevation provider. The globe is drawn as a translucent water surface over a
// dim-grey background, the 3D mesh sits on top (depth test against terrain off
// so it stays visible through the water). This replaces the former imperative
// prepareSceneForHGK scene setup.
const FLOOD_STYLE_BASE = {
  live: {
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
  },
  members: {
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
} as const;

const sceneStyles: Record<string, SceneStyle> = Object.fromEntries(
  FLOOD_TERRAIN_PROVIDER_IDS.map((id) => [
    id,
    {
      name: FLOOD_STYLE_LABELS[id] ?? id,
      live: FLOOD_STYLE_BASE.live,
      members: {
        ...FLOOD_STYLE_BASE.members,
        terrainProviderId: id,
      },
    },
  ])
);

// Initial style matches the default control state: simulation 0 + HW-Schutz on.
const DEFAULT_SCENE_STYLE = HGK_KEYS[0].hws;

export const defaultCesiumState: CesiumState = {
  currentSceneStyle: DEFAULT_SCENE_STYLE,
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
  sceneStyles,
  models: MODEL_ASSETS,
};

export default defaultCesiumState;
