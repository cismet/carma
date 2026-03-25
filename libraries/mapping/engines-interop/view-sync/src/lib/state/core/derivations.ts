import { isFiniteNumber } from "@carma/math";
import { type CameraIntrinsics } from "@carma-commons/camera/model";
import type { Meters, Radians } from "@carma/units/types";
import { getZoomFromPixelResolutionAtLatitudeRad } from "@carma/geo/utils";
import { readMetersPerCssPixel } from "../../adapters/sharedProjection";
import { deriveObjectCentricViewAnglesFromOrientation } from "../../core/objectCentricAngles";
import type { CommonViewState, DerivedView } from "./types";

// ---------------------------------------------------------------------------
// Individual derivations — all pure functions from CommonViewState fields.
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
  intrinsics: CameraIntrinsics,
  viewportWidthPx?: number,
  viewportHeightPx?: number
): { widthPx: number; heightPx: number } => {
  const viewOffset = intrinsics.viewOffset;
  const widthPx =
    readViewportDimension(viewportWidthPx, viewOffset?.width) ??
    DEFAULT_VIEWPORT_PX;
  const heightPx =
    readViewportDimension(viewportHeightPx, viewOffset?.height) ??
    DEFAULT_VIEWPORT_PX;

  return { widthPx, heightPx };
};

const readLongerEdgeFovRad = (
  intrinsics: CameraIntrinsics,
  viewportWidthPx: number,
  viewportHeightPx: number
): number | undefined => {
  const verticalFov = intrinsics.fov;
  const horizontalFov = intrinsics.fovHorizontal;
  const aspect =
    isFiniteNumber(viewportWidthPx) &&
    isFiniteNumber(viewportHeightPx) &&
    viewportWidthPx > 0 &&
    viewportHeightPx > 0
      ? viewportWidthPx / viewportHeightPx
      : undefined;
  const derivedHorizontalFov =
    isFiniteNumber(verticalFov) &&
    verticalFov > 0 &&
    isFiniteNumber(aspect) &&
    aspect > 1
      ? Math.atan(Math.tan(verticalFov * 0.5) * aspect) * 2
      : undefined;
  const finiteCandidates = [
    verticalFov,
    horizontalFov,
    derivedHorizontalFov,
  ].filter(
    (candidate): candidate is number =>
      isFiniteNumber(candidate) && candidate > 0
  );

  return finiteCandidates.length > 0
    ? Math.max(...finiteCandidates)
    : undefined;
};

/**
 * Line-of-sight distance from camera to anchor in meters.
 */
export const deriveRange = (state: CommonViewState): Meters =>
  state.cameraPosition.distanceTo(state.anchor) as Meters;

/**
 * Derive bearing, pitch, range from the canonical local orientation.
 * This keeps the angular decomposition stable even when the camera position
 * is almost perfectly vertical above the anchor.
 */
export const deriveOrbitAngles = (
  state: CommonViewState
): { bearing: Radians; pitch: Radians; range: Meters } => {
  const { bearing, pitch } = deriveObjectCentricViewAnglesFromOrientation(
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
export const deriveRoll = (state: CommonViewState): Radians => {
  return deriveObjectCentricViewAnglesFromOrientation(state.orientation).roll;
};

/**
 * Derive MapLibre-convention zoom from range + FOV + latitude.
 */
export const deriveZoom = (
  state: CommonViewState,
  viewportWidthPx?: number,
  viewportHeightPx?: number
): number => {
  const { widthPx, heightPx } = readViewportDimensions(
    state.intrinsics,
    viewportWidthPx,
    viewportHeightPx
  );
  const range = deriveRange(state);
  const fov = readLongerEdgeFovRad(state.intrinsics, widthPx, heightPx);
  if (!isFiniteNumber(fov) || fov <= 0 || range <= 0) {
    return 0;
  }

  const mpp = readMetersPerCssPixel({
    rangeM: range,
    fovRad: fov,
    viewportWidthPx: widthPx,
    viewportHeightPx: heightPx,
  });
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
 * Derive the complete flat view (all angles + zoom) from a CommonViewState.
 * Used for hash encoding and 2D framework adapters.
 */
export const deriveView = (
  state: CommonViewState,
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
