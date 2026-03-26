// TODO CONSOLIDATE_CESIUM

import { Color } from "cesium";

import { CesiumState } from "@carma-mapping/engines/cesium";

import { colorToConstructorArgs } from "@carma/cesium";

import { MODEL_ASSETS } from "./assets.config";

export const defaultCesiumState: CesiumState = {
  showPrimaryTileset: false,
  showSecondaryTileset: true,
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
    primary: {
      backgroundColor: colorToConstructorArgs(Color.GRAY),
      globe: {
        baseColor: [0, 0, 0, 0.01],
      },
    },
    secondary: {
      backgroundColor: colorToConstructorArgs(Color.WHITE),
      globe: {
        baseColor: colorToConstructorArgs(Color.WHITE),
      },
    },
  },
  models: MODEL_ASSETS,
};

export default defaultCesiumState;
