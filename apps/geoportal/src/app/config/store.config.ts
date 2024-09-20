// TODO CONSOLIDATE_CESIUM 

import { Cartesian3, Color } from 'cesium';

import { CesiumState, VIEWER_TRANSITION_STATE } from '@carma-mapping/cesium-engine';
import { colorToArray } from '@carma-mapping/cesium-engine/utils';

import { MODEL_ASSETS } from './assets.config';
import {
  BASEMAP_METROPOLRUHR_WMS_GRAUBLAU,
  FOOTPRINT_GEOJSON_SOURCES,
  WUPP_MESH_2024,
  WUPP_LOD2_TILESET,
  WUPP_TERRAIN_PROVIDER,
} from './dataSources.config';
import { WUPPERTAL } from './locations.config';

// SETUP Store State

const { x, y, z } = Cartesian3.fromDegrees(
  WUPPERTAL.position.lon,
  WUPPERTAL.position.lat,
  WUPPERTAL.ground
);

// position relative to the home position
const homeOffset = {
  x: 0,
  y: -50000, // southwards
  z: 45000, // elevation
};

export const defaultCesiumState: CesiumState = {
  isAnimating: false,
  currentTransition: VIEWER_TRANSITION_STATE.NONE,
  isMode2d: true,
  homeOffset: homeOffset,
  homePosition: { x, y, z },
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
    minimumZoomDistance: 100
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
  models: MODEL_ASSETS,
};

export default defaultCesiumState;
