import {
  Cartographic,
  Ellipsoid,
  HeadingPitchRange,
  getPointsFromCartographicAndHeadingPitchRange,
} from "@carma/cesium";

export type SceneViewStateLike = {
  anchor: {
    lngDeg: number;
    latDeg: number;
    heightM: number;
  };
  orientation: {
    bearingRad?: number;
    pitchRad?: number;
    fovVerticalRad?: number;
    rangeM?: number;
  };
};

export type InitialCameraViewLike = {
  position?: Cartographic;
  heading?: number;
  pitch?: number;
  fov?: number;
};

export const readInitialCameraViewFromSceneViewState = (
  viewState: SceneViewStateLike | null | undefined,
  options: {
    defaultRangeM?: number;
  } = {}
): InitialCameraViewLike | undefined => {
  if (!viewState) {
    return undefined;
  }

  const headingRad = viewState.orientation.bearingRad ?? 0;
  const pitchRad = viewState.orientation.pitchRad ?? 0;
  const fovVerticalRad = viewState.orientation.fovVerticalRad;
  const defaultRangeM = options.defaultRangeM ?? 750;

  const anchorCartographic = Cartographic.fromDegrees(
    viewState.anchor.lngDeg,
    viewState.anchor.latDeg,
    viewState.anchor.heightM
  );

  const headingPitchRange = new HeadingPitchRange(
    headingRad,
    pitchRad,
    Math.max(0.01, viewState.orientation.rangeM ?? defaultRangeM)
  );

  const points = getPointsFromCartographicAndHeadingPitchRange({
    cartographic: anchorCartographic,
    headingPitchRange,
  });
  if (!points) {
    return undefined;
  }

  const position = Ellipsoid.WGS84.cartesianToCartographic(
    points.cameraPositionECEF
  );
  if (!position) {
    return undefined;
  }

  return {
    position,
    heading: headingPitchRange.heading,
    pitch: headingPitchRange.pitch,
    ...(Number.isFinite(fovVerticalRad) ? { fov: fovVerticalRad } : {}),
  };
};
