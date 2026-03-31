import {
  readHorizontalFovFromVertical,
  readLongerEdgeFovFromIntrinsics,
  readRangeFromMetersPerCssPixel,
  readVerticalFovFromLongerEdge,
  type CameraIntrinsics,
} from "@carma-commons/camera/model";
import { getPixelResolutionFromZoomAtLatitudeRad } from "@carma/geo/utils";
import { isFiniteNumber } from "@carma/math";
import type { Meters, Radians } from "@carma/units/types";

import { buildViewState } from "./construct";
import { deriveView } from "./derivations";
import type { ViewState } from "./types";
const MAPLIBRE_TILE_SIZE_PX = 512;

export const resolveViewStateForViewport = (
  state: ViewState,
  options: {
    viewportWidthPx: number;
    viewportHeightPx: number;
    longerEdgeFovOverride?: Radians;
    applyResolvedIntrinsics?: boolean;
  }
): ViewState => {
  const restoreHints = state.metadata.restoreHints?.shareable;
  const {
    viewportWidthPx,
    viewportHeightPx,
    longerEdgeFovOverride,
    applyResolvedIntrinsics = true,
  } = options;

  if (
    !restoreHints ||
    !isFiniteNumber(viewportWidthPx) ||
    viewportWidthPx <= 0 ||
    !isFiniteNumber(viewportHeightPx) ||
    viewportHeightPx <= 0
  ) {
    return state;
  }

  const aspect = viewportWidthPx / viewportHeightPx;
  const longerEdgeFov =
    (isFiniteNumber(longerEdgeFovOverride)
      ? longerEdgeFovOverride
      : undefined) ??
    restoreHints.fovLongerEdge ??
    readLongerEdgeFovFromIntrinsics(state.intrinsics, {
      viewportWidthPx,
      viewportHeightPx,
    });
  const resolvedVerticalFov = applyResolvedIntrinsics
    ? readVerticalFovFromLongerEdge(longerEdgeFov, aspect)
    : undefined;
  const resolvedHorizontalFov = applyResolvedIntrinsics
    ? readHorizontalFovFromVertical(resolvedVerticalFov, aspect)
    : undefined;
  const view = deriveView(state);
  const resolvedRange =
    isFiniteNumber(restoreHints.zoom) && isFiniteNumber(longerEdgeFov)
      ? readRangeFromMetersPerCssPixel({
          metersPerCssPixel: getPixelResolutionFromZoomAtLatitudeRad(
            restoreHints.zoom,
            state.anchorCartographic.latitude,
            { tileSize: MAPLIBRE_TILE_SIZE_PX }
          ),
          fovRad: longerEdgeFov,
          viewportWidthPx,
          viewportHeightPx,
        })
      : null;

  return buildViewState({
    longitude: view.longitude,
    latitude: view.latitude,
    altitude: view.altitude,
    bearing: view.bearing,
    pitch: view.pitch,
    roll: view.roll,
    range: (resolvedRange ?? view.range) as Meters,
    intrinsics: {
      ...state.intrinsics,
      ...(isFiniteNumber(resolvedVerticalFov)
        ? { fov: resolvedVerticalFov as CameraIntrinsics["fov"] }
        : {}),
      ...(isFiniteNumber(resolvedHorizontalFov)
        ? {
            fovHorizontal:
              resolvedHorizontalFov as CameraIntrinsics["fovHorizontal"],
          }
        : {}),
    },
    metadata: state.metadata,
  });
};
