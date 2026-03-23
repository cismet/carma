import { isFiniteNumber, Quaternion, Vector3 } from "@carma/math";
import type { Meters, Radians } from "@carma/units/types";
import {
  getZoomFromPixelResolutionAtLatitudeRad,
  ecefToEnuOffset,
} from "@carma/geo/utils";
import { readMetersPerCssPixel } from "../../adapters/sharedProjection";
import type { CommonViewState, DerivedView } from "./types";

// ---------------------------------------------------------------------------
// Individual derivations — all pure functions from CommonViewState fields.
// No Cesium, MapLibre, or framework imports.
// ---------------------------------------------------------------------------

const MAPLIBRE_TILE_SIZE_PX = 512;
const DEFAULT_VIEWPORT_PX = 1920;

/**
 * Line-of-sight distance from camera to anchor in meters.
 */
export const deriveRange = (state: CommonViewState): Meters =>
  state.cameraPosition.distanceTo(state.anchor) as Meters;

/**
 * Derive bearing, pitch, range from camera → anchor offset in the anchor's
 * ENU frame. Uses the same convention as the shared camera model:
 * - bearing: atan2(-east, -north) — target-facing azimuth
 * - pitch: 0 = nadir, +PI/2 = horizon (MapLibre orbit convention)
 */
export const deriveOrbitAngles = (
  state: CommonViewState
): { bearing: Radians; pitch: Radians; range: Meters } => {
  const enu = ecefToEnuOffset(state.cameraPosition, state.anchor);
  const range = Math.sqrt(
    enu.east * enu.east + enu.north * enu.north + enu.up * enu.up
  );
  const horizontalDist = Math.hypot(enu.east, enu.north);

  // Target-facing bearing: negate offset to get camera-looking-at-target direction
  const bearing = Math.atan2(-enu.east, -enu.north);

  // Cesium pitch convention: -PI/2 = nadir, 0 = horizon
  // Our convention: 0 = nadir, +PI/2 = horizon
  // enu.up > 0 means camera is above anchor → pitch < PI/2
  const cesiumPitch = -Math.atan2(enu.up, horizontalDist);
  const pitch = cesiumPitch + Math.PI * 0.5;

  return {
    bearing: bearing as Radians,
    pitch: pitch as Radians,
    range: range as Meters,
  };
};

/**
 * Derive roll from the camera orientation quaternion after removing
 * bearing and pitch rotations. Roll is the residual rotation around the
 * camera's forward axis.
 */
export const deriveRoll = (state: CommonViewState): Radians => {
  const { bearing, pitch } = deriveOrbitAngles(state);

  // Build expected orientation from bearing + pitch (no roll)
  const qBearing = _quatScratchA.setFromAxisAngle(_yAxis, bearing as number);
  const cesiumPitch = (pitch as number) - Math.PI * 0.5;
  const qPitch = _quatScratchB.setFromAxisAngle(_xAxis, cesiumPitch);
  const qExpected = qBearing.multiply(qPitch);

  // Roll = angle between expected and actual orientation
  const qDiff = qExpected.conjugate().multiply(state.orientation);
  const rollAngle =
    2 *
    Math.atan2(
      Math.sqrt(qDiff.x * qDiff.x + qDiff.y * qDiff.y + qDiff.z * qDiff.z),
      Math.abs(qDiff.w)
    );
  return (qDiff.z < 0 ? -rollAngle : rollAngle) as Radians;
};

const _quatScratchA = new Quaternion();
const _quatScratchB = new Quaternion();
const _yAxis = new Vector3(0, 1, 0);
const _xAxis = new Vector3(1, 0, 0);

/**
 * Derive MapLibre-convention zoom from range + FOV + latitude.
 */
export const deriveZoom = (
  state: CommonViewState,
  viewportWidthPx: number = DEFAULT_VIEWPORT_PX,
  viewportHeightPx: number = DEFAULT_VIEWPORT_PX
): number => {
  const range = deriveRange(state);
  const fov = state.intrinsics.fov;
  if (!isFiniteNumber(fov) || fov <= 0 || range <= 0) {
    return 0;
  }

  const mpp = readMetersPerCssPixel({
    rangeM: range,
    fovRad: fov,
    viewportWidthPx,
    viewportHeightPx,
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
