import {
  Camera,
  Cartesian3,
  Cartographic,
  HeadingPitchRange,
} from "@carma/cesium";

export const distanceFromZoomLevel = (zoom: number) => {
  return 40000000 / Math.pow(2, zoom);
};

export const getHeadingPitchRangeFromZoom = (
  zoom: number,
  {
    heading = 0,
    pitch = Math.PI / 2,
  }: { heading?: number; pitch?: number } = {} // prior
) => {
  const range = distanceFromZoomLevel(zoom);
  return new HeadingPitchRange(heading, pitch, range);
};

export const getHeadingPitchRangeFromHeight = (
  { positionCartographic, heading, pitch }: Camera,
  targetPosition: Cartographic
) => {
  const cameraHeight = positionCartographic.height;
  const targetHeight = targetPosition.height;
  const heightDifference = cameraHeight - targetHeight;

  const range = heightDifference / Math.cos(pitch);
  //console.log("getHPR from Height", Math.round(cameraHeight),Math.round(targetHeight),Math.round(heightDifference),Math.round(range), Math.cos(pitch),);
  return new HeadingPitchRange(heading, pitch, range);
};

export const getPositionWithHeightAsync = async (
  position: Cartographic,
  useClampedHeight: boolean = false
): Promise<Cartographic | null> => {
  let result: Cartographic | null = null;

  // This function needs to be updated to work without the withElevationProviders callback
  // For now, return null as a placeholder
  console.warn(
    "getPositionWithHeightAsync needs to be updated to work without withElevationProviders callback"
  );

  return result;
};

export const validateWorldCoordinate = (
  testPosition: Cartesian3 | Camera,
  center: Cartesian3,
  range: number = 50000,
  minHeight: number = 0
): boolean => {
  const wc =
    testPosition instanceof Camera ? testPosition.positionWC : testPosition;
  return (
    Cartesian3.distance(wc, center) <= range &&
    Cartographic.fromCartesian(wc).height >= minHeight
  );
};
