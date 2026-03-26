import {
  Cartographic,
  Ellipsoid,
  HeadingPitchRange,
  getPointsFromCartographicAndHeadingPitchRange,
} from "@carma/cesium";
import { PI_OVER_TWO } from "@carma/math";
import { readLongerEdgeFovFromIntrinsics } from "@carma-commons/camera/model";
import { deriveView } from "../core/derivations";
import type { ViewState } from "../core/types";

export type InitialCameraViewLike = {
  position?: Cartographic;
  anchor?: Cartographic;
  zoom?: number;
  heading?: number;
  pitch?: number;
  fov?: number | null;
  fovLongerEdge?: number | null;
};

const toCesiumHeadingPitchRangePitch = (orbitPitch: number): number =>
  orbitPitch - PI_OVER_TWO;

export const readInitialCameraViewFromViewState = (
  state: ViewState | null | undefined,
  options: {
    defaultRangeM?: number;
  } = {}
): InitialCameraViewLike | undefined => {
  if (!state) {
    return undefined;
  }

  const view = deriveView(state);
  const longerEdgeFov = readLongerEdgeFovFromIntrinsics(state.intrinsics);
  const headingRad = view.bearing ?? 0;
  const pitchRad = toCesiumHeadingPitchRangePitch(view.pitch ?? 0);
  const defaultRangeM = options.defaultRangeM ?? 750;
  const verticalFovRad = Number.isFinite(state.intrinsics.fov)
    ? state.intrinsics.fov
    : undefined;

  const anchorCartographic = Cartographic.fromRadians(
    view.longitude,
    view.latitude,
    view.altitude
  );

  const headingPitchRange = new HeadingPitchRange(
    headingRad,
    pitchRad,
    Math.max(0.01, (view.range as number) ?? defaultRangeM)
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
    ...(Number.isFinite(view.zoom) ? { zoom: view.zoom } : {}),
    heading: headingPitchRange.heading,
    pitch: headingPitchRange.pitch,
    fov: Number.isFinite(verticalFovRad) ? verticalFovRad : null,
    fovLongerEdge: Number.isFinite(longerEdgeFov) ? longerEdgeFov : null,
  };
};
