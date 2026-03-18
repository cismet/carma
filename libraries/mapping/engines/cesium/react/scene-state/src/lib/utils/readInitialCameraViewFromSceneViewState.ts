import {
  Cartographic,
  Ellipsoid,
  HeadingPitchRange,
  getPointsFromCartographicAndHeadingPitchRange,
} from "@carma/cesium";
import { toCesiumPitchFromViewSyncPitch } from "@carma-mapping/engines-interop/view-sync";

export type ViewStateLike = {
  longitude: number;
  latitude: number;
  altitude: number;
  bearing?: number;
  pitch?: number;
  fovVertical?: number;
  range?: number;
};

export type InitialCameraViewLike = {
  position?: Cartographic;
  heading?: number;
  pitch?: number;
  fov?: number;
};

export const readInitialCameraViewFromSceneViewState = (
  viewState: ViewStateLike | null | undefined,
  options: {
    defaultRangeM?: number;
  } = {}
): InitialCameraViewLike | undefined => {
  if (!viewState) {
    return undefined;
  }

  const headingRad = viewState.bearing ?? 0;
  const pitchRad = toCesiumPitchFromViewSyncPitch(
    viewState.pitch ?? 0
  );
  const fovVerticalRad = viewState.fovVertical;
  const defaultRangeM = options.defaultRangeM ?? 750;

  const anchorCartographic = Cartographic.fromRadians(
    viewState.longitude,
    viewState.latitude,
    viewState.altitude
  );

  const headingPitchRange = new HeadingPitchRange(
    headingRad,
    pitchRad,
    Math.max(0.01, viewState.range ?? defaultRangeM)
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
