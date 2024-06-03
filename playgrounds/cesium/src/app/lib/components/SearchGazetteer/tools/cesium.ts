import {
  HeadingPitchRange,
  Math as CMath,
  Scene,
  sampleTerrainMostDetailed,
  Cartographic,
} from 'cesium';

export const distanceFromZoomLevel = (zoom: number) => {
  return 40000000 / Math.pow(2, zoom);
};

export const getHeadingPitchRangeFromZoom = (
  zoom: number,
  headingDeg = 0,
  pitchDeg = 60
) => {
  const range = distanceFromZoomLevel(zoom);
  const heading = CMath.toRadians(headingDeg);
  const pitch = CMath.toRadians(pitchDeg);
  return new HeadingPitchRange(heading, pitch, range);
};

export const getPositionWithElevationAsync = async (
  scene: Scene,
  position: Cartographic
) => {
  /*
  const terrainProvider = scene.globe.terrainProvider;
  console.log('terrainProvider', terrainProvider);
  return sampleTerrainMostDetailed(terrainProvider, [position]).then(
    (updatedPositions) => {
      return updatedPositions[0];
    }
  );
*/
  const cartesianPosition = Cartographic.toCartesian(position);
  const clampedPosition = scene.clampToHeight(cartesianPosition);
  return Cartographic.fromCartesian(clampedPosition);
};
