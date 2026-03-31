import { Cartesian3 } from "cesium";

import { WUPPERTAL } from "@carma-commons/resources";
import { CesiumState } from "@carma-mapping/engines/cesium";

import { FOOTPRINT_GEOJSON_SOURCES } from "./dataSources.config";
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
  dataSources: {
    footprintGeoJson: FOOTPRINT_GEOJSON_SOURCES.VORONOI,
  },
  models: MODEL_ASSETS,
};

export default defaultViewerState;
