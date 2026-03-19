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
  zoom?: number;
  bearing?: number;
  pitch?: number;
  fovVertical?: number;
  fovHorizontal?: number;
  fovLongerEdge?: number;
  range?: number;
};

export type InitialCameraViewLike = {
  position?: Cartographic;
  anchor?: Cartographic;
  zoom?: number;
  heading?: number;
  pitch?: number;
  fov?: number | null;
  fovLongerEdge?: number | null;
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
  const pitchRad = toCesiumPitchFromViewSyncPitch(viewState.pitch ?? 0);
  const defaultRangeM = options.defaultRangeM ?? 750;
  const finiteLongerEdgeCandidates = [
    viewState.fovLongerEdge,
    viewState.fovHorizontal,
    viewState.fovVertical,
  ].filter(Number.isFinite) as number[];
  const longerEdgeFovRad =
    finiteLongerEdgeCandidates.length > 0
      ? Math.max(...finiteLongerEdgeCandidates)
      : undefined;
  const verticalFovRad = Number.isFinite(viewState.fovVertical)
    ? viewState.fovVertical
    : undefined;

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
    anchor: anchorCartographic,
    ...(Number.isFinite(viewState.zoom) ? { zoom: viewState.zoom } : {}),
    heading: headingPitchRange.heading,
    pitch: headingPitchRange.pitch,
    fov: Number.isFinite(verticalFovRad) ? verticalFovRad : null,
    fovLongerEdge: Number.isFinite(longerEdgeFovRad) ? longerEdgeFovRad : null,
  };
};
