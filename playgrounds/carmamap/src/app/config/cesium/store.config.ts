// TODO CONSOLIDATE_CESIUM

import { Cartesian3, Color } from "cesium";

import { WUPPERTAL } from "@carma/resources";
// TODO: Remove CesiumState import - not available in current version
// import { CesiumState, toColorRgbaArray } from "@carma-mapping/engines/cesium/core";

import { MODEL_ASSETS } from "./assets.config";

// SETUP Store State

const homePosition = Cartesian3.fromDegrees(
  WUPPERTAL.position.longitude,
  WUPPERTAL.position.latitude,
  WUPPERTAL.position.altitude
);

// position relative to the home position
const homeOffset = {
  x: 0,
  y: -50000, // southwards
  z: 45000, // elevation
};

// TODO: Replace with proper CesiumState when available
export const defaultCesiumState = {
  isMode2d: true,
  homeOffset: homeOffset,
  homePosition,
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
      backgroundColor: [0.5, 0.5, 0.5, 1.0], // TODO: Replace toColorRgbaArray(Color.GRAY)
      globe: {
        baseColor: [0, 0, 0, 0.01],
      },
    },
    secondary: {
      backgroundColor: [1.0, 1.0, 1.0, 1.0], // TODO: Replace toColorRgbaArray(Color.WHITE)
      globe: {
        baseColor: [1.0, 1.0, 1.0, 1.0], // TODO: Replace toColorRgbaArray(Color.WHITE)
      },
    },
  },
  models: MODEL_ASSETS,
};

export default defaultCesiumState;
