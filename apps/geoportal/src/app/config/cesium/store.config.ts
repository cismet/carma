// TODO CONSOLIDATE_CESIUM

import { Cartesian3, Color } from "cesium";

import { WUPPERTAL } from "@carma-commons/resources";
import { CesiumState, colorToArray } from "@carma-mapping/cesium-engine";

import { MODEL_ASSETS } from "./assets.config";

import { FOOTPRINT_GEOJSON_SOURCES } from "./dataSources.config";

// SETUP Store State

const homePosition = Cartesian3.fromDegrees(
  WUPPERTAL.position.lngDeg,
  WUPPERTAL.position.latDeg,
  WUPPERTAL.height
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
      backgroundColor: Color.GRAY,
      globe: {
        baseColor: new Color(0, 0, 0, 0.01),
      },
    },
    secondary: {
      backgroundColor: Color.WHITE,
      globe: {
        baseColor: Color.WHITE,
      },
    },
  },
  dataSources: {
    footprintGeoJson: FOOTPRINT_GEOJSON_SOURCES.VORONOI,
  },
  models: MODEL_ASSETS,
};

export default defaultCesiumState;
