import { Quaternion, Vector3 } from "@carma/math";
import type { Radians } from "@carma/units/types";
import type { Altitude } from "@carma/geo/types";
import {
  cartographicToEcef,
  enuOffsetToEcef,
  ecefToCartographic,
} from "@carma/geo/utils";
import type { CameraIntrinsics } from "@carma-commons/camera/model";
import type { CommonViewState, ViewStateMetadata } from "./types";

// ---------------------------------------------------------------------------
// Construct a CommonViewState from angle-based inputs.
// Used by hash decode, 2D adapter reads, and programmatic camera setup.
// ---------------------------------------------------------------------------

export type AngleBasedViewInput = {
  /** Anchor longitude in radians. */
  longitude: number;
  /** Anchor latitude in radians. */
  latitude: number;
  /** Anchor altitude in meters (ellipsoidal). */
  altitude: number;
  /** Target-facing bearing in radians (0 = north, positive toward east). */
  bearing: number;
  /** Orbit pitch in radians (0 = nadir, PI/2 = horizon). */
  pitch: number;
  /** Roll in radians (optional, default 0). */
  roll?: number;
  /** Line-of-sight range in meters. */
  range: number;
  /** Camera intrinsics (FOV, near, far). */
  intrinsics: CameraIntrinsics;
  /** Frame metadata. */
  metadata: ViewStateMetadata;
};

/**
 * Build a CommonViewState from angle-based orbit parameters.
 *
 * Converts anchor (lon/lat/alt) to ECEF, computes camera position from
 * bearing + pitch + range in the anchor's ENU frame, and builds the
 * orientation quaternion.
 */
export const buildCommonViewState = (
  input: AngleBasedViewInput
): CommonViewState => {
  const anchor = cartographicToEcef(
    input.longitude,
    input.latitude,
    input.altitude
  );
  const anchorCartographic = {
    longitude: input.longitude as Radians,
    latitude: input.latitude as Radians,
    altitude: input.altitude as Altitude.EllipsoidalWGS84Meters,
  };

  // Convert bearing + pitch + range to ENU offset from anchor to camera
  // bearing: target-facing azimuth → camera offset is negated
  // pitch (orbit): 0=nadir(camera above), PI/2=horizon
  const cesiumPitch = input.pitch - Math.PI * 0.5; // → -PI/2=nadir, 0=horizon
  const cosPitch = Math.cos(cesiumPitch);
  const sinPitch = Math.sin(cesiumPitch);

  // Camera-to-anchor bearing → camera offset bearing is +PI from target-facing
  const offsetBearing = input.bearing + Math.PI;
  const east = Math.sin(offsetBearing) * cosPitch * input.range;
  const north = Math.cos(offsetBearing) * cosPitch * input.range;
  const up = -sinPitch * input.range; // negative because cesiumPitch < 0 means above

  const cameraPosition = enuOffsetToEcef(east, north, up, anchor);

  // Build orientation quaternion from bearing + pitch + roll
  const qBearing = new Quaternion().setFromAxisAngle(_yAxis, input.bearing);
  const qPitch = new Quaternion().setFromAxisAngle(_xAxis, cesiumPitch);
  const orientation = qBearing.multiply(qPitch);

  if (input.roll && Math.abs(input.roll) > 1e-8) {
    const qRoll = new Quaternion().setFromAxisAngle(_zAxis, input.roll);
    orientation.multiply(qRoll);
  }

  return Object.freeze({
    anchor,
    anchorCartographic,
    cameraPosition,
    orientation,
    intrinsics: input.intrinsics,
    metadata: input.metadata,
  });
};

/**
 * Build a CommonViewState directly from ECEF positions + quaternion.
 * Used by 3D adapters (Cesium) that already have world-space data.
 */
export const buildCommonViewStateFromEcef = (input: {
  anchor: Vector3;
  cameraPosition: Vector3;
  orientation: Quaternion;
  intrinsics: CameraIntrinsics;
  metadata: ViewStateMetadata;
}): CommonViewState => {
  const anchorCartographic = ecefToCartographic(input.anchor);
  return Object.freeze({
    anchor: input.anchor,
    anchorCartographic,
    cameraPosition: input.cameraPosition,
    orientation: input.orientation,
    intrinsics: input.intrinsics,
    metadata: input.metadata,
  });
};

const _yAxis = new Vector3(0, 1, 0);
const _xAxis = new Vector3(1, 0, 0);
const _zAxis = new Vector3(0, 0, 1);
