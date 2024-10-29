import { Cartesian3 } from "cesium";

import { WUPPERTAL } from "@carma-commons/resources";
import { CesiumState } from "@carma-mapping/cesium-engine";

import { FOOTPRINT_GEOJSON_SOURCES } from "./dataSources.config";
import { MODEL_ASSETS } from "./assets.config";

// SETUP Store State

const { x, y, z } = Cartesian3.fromDegrees(
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

export const defaultViewerState: CesiumState = {
  isMode2d: false,
  homeOffset: homeOffset,
  homePosition: { x, y, z },
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
  dataSources: {
    footprintGeoJson: FOOTPRINT_GEOJSON_SOURCES.VORONOI,
  },
  models: MODEL_ASSETS,
};

export default defaultViewerState;
