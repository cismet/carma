import { readMetersPerCssPixelFromIntrinsics } from "@carma-commons/camera/model";
import { getZoomFromPixelResolutionAtLatitudeRad } from "@carma-geo/utils";
import { isFiniteNumber } from "@carma-commons/math";
import type { Meters, Radians } from "@carma-units";

import { deriveAnchoredViewAnglesFromOrientation } from "./anchoredOrbitAngles";
import type { ViewState, DerivedView } from "./types";
// ---------------------------------------------------------------------------
// Individual derivations — all pure functions from ViewState fields.
// No Cesium, MapLibre, or framework imports.
// ---------------------------------------------------------------------------

const MAPLIBRE_TILE_SIZE_PX = 512;
const DEFAULT_VIEWPORT_PX = 1920;

const readViewportDimension = (
  preferred: number | undefined,
  fallback: number | undefined
): number | undefined =>
  isFiniteNumber(preferred) && preferred > 0
    ? preferred
    : isFiniteNumber(fallback) && fallback > 0
    ? fallback
    : undefined;

const readViewportDimensions = (
  state: ViewState,
  viewportWidthPx?: number,
  viewportHeightPx?: number
): { widthPx: number; heightPx: number } => {
  const viewOffset = state.intrinsics.viewOffset;
  const storedViewport = state.metadata.viewport;
  const widthPx =
    readViewportDimension(
      viewportWidthPx,
      readViewportDimension(storedViewport?.widthPx, viewOffset?.width)
    ) ?? DEFAULT_VIEWPORT_PX;
  const heightPx =
    readViewportDimension(
      viewportHeightPx,
      readViewportDimension(storedViewport?.heightPx, viewOffset?.height)
    ) ?? DEFAULT_VIEWPORT_PX;

  return { widthPx, heightPx };
};

export const readMetersPerCssPixelFromViewState = (
  state: ViewState,
  viewportWidthPx?: number,
  viewportHeightPx?: number
): Meters | null => {
  const { widthPx, heightPx } = readViewportDimensions(
    state,
    viewportWidthPx,
    viewportHeightPx
  );

  return readMetersPerCssPixelFromIntrinsics({
    intrinsics: state.intrinsics,
    rangeM: deriveRange(state),
    viewportWidthPx: widthPx,
    viewportHeightPx: heightPx,
  });
};

/**
 * Line-of-sight distance from camera to anchor in meters.
 */
export const deriveRange = (state: ViewState): Meters =>
  state.cameraPosition.distanceTo(state.anchor) as Meters;

/**
 * Derive bearing, pitch, range from the canonical local orientation.
 * This keeps the angular decomposition stable even when the camera position
 * is almost perfectly vertical above the anchor.
 */
export const deriveOrbitAngles = (
  state: ViewState
): { bearing: Radians; pitch: Radians; range: Meters } => {
  const { bearing, pitch } = deriveAnchoredViewAnglesFromOrientation(
    state.orientation
  );

  return {
    bearing,
    pitch,
    range: deriveRange(state),
  };
};

/**
 * Derive roll from the camera orientation quaternion after removing
 * bearing and pitch rotations. Roll is the residual rotation around the
 * camera's forward axis.
 */
export const deriveRoll = (state: ViewState): Radians => {
  return deriveAnchoredViewAnglesFromOrientation(state.orientation).roll;
};

/**
 * Derive MapLibre-convention zoom from range + FOV + latitude.
 */
export const deriveZoom = (
  state: ViewState,
  viewportWidthPx?: number,
  viewportHeightPx?: number
): number => {
  const mpp = readMetersPerCssPixelFromViewState(
    state,
    viewportWidthPx,
    viewportHeightPx
  );
  if (!isFiniteNumber(mpp) || mpp <= 0) {
    return 0;
  }

  const zoom = getZoomFromPixelResolutionAtLatitudeRad(
    mpp as Meters,
    state.anchorCartographic.latitude,
    { tileSize: MAPLIBRE_TILE_SIZE_PX }
  );
  return isFiniteNumber(zoom) ? zoom : 0;
};

/**
 * Derive the complete flat view (all angles + zoom) from a ViewState.
 * Used for hash encoding and 2D framework adapters.
 */
export const deriveView = (
  state: ViewState,
  viewportWidthPx?: number,
  viewportHeightPx?: number
): DerivedView => {
  const { bearing, pitch, range } = deriveOrbitAngles(state);
  const roll = deriveRoll(state);
  const zoom = deriveZoom(state, viewportWidthPx, viewportHeightPx);

  return {
    longitude: state.anchorCartographic.longitude,
    latitude: state.anchorCartographic.latitude,
    altitude: state.anchorCartographic.altitude as Meters,
    bearing,
    pitch,
    roll,
    range,
    zoom,
    fov: (state.intrinsics.fov ?? 0) as Radians,
  };
};
