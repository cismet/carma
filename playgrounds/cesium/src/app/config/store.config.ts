import { Cartesian3 } from "cesium";

import { WUPPERTAL } from "@carma-commons/resources";
import { CesiumState } from "@carma-mapping/engines/cesium/react/runtime";

import { MODEL_ASSETS } from "./assets.config";

// SETUP Store State
export const CESIUM_TILESET_IDS = {
  PRIMARY: "primary",
  SECONDARY: "secondary",
} as const;

export const DEFAULT_CESIUM_SCENE_STYLE_ID = CESIUM_TILESET_IDS.PRIMARY;

export const CESIUM_HOME_POSITION = Cartesian3.fromDegrees(
  WUPPERTAL.position.longitude,
  WUPPERTAL.position.latitude,
  WUPPERTAL.position.altitude
);

export const defaultViewerState: CesiumState = {
  currentSceneStyle: DEFAULT_CESIUM_SCENE_STYLE_ID,
  sceneSpaceCameraController: {
    enableCollisionDetection: true,
    maximumZoomDistance: 50000,
    minimumZoomDistance: 100,
  },
  styling: {
    tileset: {
      opacity: 1.0,
    },
  },
  sceneStyles: {
    [CESIUM_TILESET_IDS.PRIMARY]: {
      members: {
        tilesets: [{ id: CESIUM_TILESET_IDS.PRIMARY }],
      },
    },
    [CESIUM_TILESET_IDS.SECONDARY]: {
      members: {
        tilesets: [{ id: CESIUM_TILESET_IDS.SECONDARY }],
      },
    },
  },
  models: MODEL_ASSETS,
};

export default defaultViewerState;
