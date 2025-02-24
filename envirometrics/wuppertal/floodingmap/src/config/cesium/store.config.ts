// TODO CONSOLIDATE_CESIUM

import { Cartesian3, Color } from "cesium";

import { WUPPERTAL } from "@carma-commons/resources";
import { CesiumState, toColorRgbaArray } from "@carma-mapping/cesium-engine";

import { MODEL_ASSETS } from "./assets.config";

// SETUP Store State

const homePosition = Cartesian3.fromDegrees(
  // Unterdörnen
  7.19163,
  51.2677,
  200
);

// position relative to the home position
const homeOffset = {
  x: 0,
  y: -50000, // southwards
  z: 45000, // elevation
};

export const defaultCesiumState: CesiumState = {
  isMode2d: true,
  homeOffset: homeOffset,
  homePosition,
  showPrimaryTileset: true,
  showSecondaryTileset: false,
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
    primary: {
      backgroundColor: toColorRgbaArray(Color.GRAY),
      globe: {
        baseColor: [0, 0, 0, 0.01],
      },
    },
    secondary: {
      backgroundColor: toColorRgbaArray(Color.WHITE),
      globe: {
        baseColor: toColorRgbaArray(Color.WHITE),
      },
    },
  },
  models: MODEL_ASSETS,
};

export default defaultCesiumState;
