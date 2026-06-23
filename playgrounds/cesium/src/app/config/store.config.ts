import { Cartesian3 } from "cesium";

import { WUPPERTAL } from "@carma-commons/resources";
import { CesiumState } from "@carma-mapping/engines/cesium/react/runtime";

import { MODEL_ASSETS } from "./assets.config";

// SETUP Store State

export const CESIUM_HOME_POSITION = Cartesian3.fromDegrees(
  WUPPERTAL.position.longitude,
  WUPPERTAL.position.latitude,
  WUPPERTAL.position.altitude
);

export const defaultViewerState: CesiumState = {
  showPrimaryTileset: true,
  showSecondaryTileset: false,
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
  models: MODEL_ASSETS,
};

export default defaultViewerState;
