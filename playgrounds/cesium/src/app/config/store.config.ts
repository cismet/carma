import { Cartesian3, Color } from "cesium";

import { BASEMAP_METROPOLRUHR_WMS_GRAUBLAU, WUPP_LOD2_TILESET, WUPP_MESH_2024, WUPP_TERRAIN_PROVIDER, WUPPERTAL } from "@carma-commons/resources";
import { CesiumState } from "@carma-mapping/cesium-engine";
import { colorToArray } from "@carma-mapping/cesium-engine/utils";

import { FOOTPRINT_GEOJSON_SOURCES } from "./dataSources.config";
import { MODEL_ASSETS } from "./assets.config";

// SETUP Store State

const { x, y, z } = Cartesian3.fromDegrees(
  WUPPERTAL.position.lngDeg,
  WUPPERTAL.position.latDeg,
  WUPPERTAL.height,
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
  sceneStyles: {
    default: {
      globe: {
        baseColor: colorToArray(Color.TEAL),
      },
    },
  },
  dataSources: {
    footprintGeoJson: FOOTPRINT_GEOJSON_SOURCES.VORONOI,
    tilesets: {
      primary: WUPP_MESH_2024,
      secondary: WUPP_LOD2_TILESET,
    },
  },
  terrainProvider: WUPP_TERRAIN_PROVIDER,
  imageryProvider: BASEMAP_METROPOLRUHR_WMS_GRAUBLAU,
  models: MODEL_ASSETS
};

export default defaultViewerState;
