// TODO CONSOLIDATE_CESIUM

import { Cartesian3, Color } from "cesium";

import { CesiumState } from "@carma-mapping/engines/cesium";

import { colorToConstructorArgs } from "@carma/cesium";

import { MODEL_ASSETS } from "./assets.config";
import { DEFAULT_VIEW_ANCHOR } from "../view.config";

// SETUP Store State

const homePosition = Cartesian3.fromDegrees(
  DEFAULT_VIEW_ANCHOR.lng,
  DEFAULT_VIEW_ANCHOR.lat,
  DEFAULT_VIEW_ANCHOR.altitude
);

// position relative to the home position
const homeOffset = {
  x: 0,
  y: -50000, // southwards
  z: 45000, // elevation
};

export const defaultCesiumState: CesiumState = {
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
