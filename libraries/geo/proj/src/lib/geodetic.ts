import { WGS84_ELLIPSOID } from "./ellipsoids";
import { Matrix4, Vector3 } from "three";

import type { Altitude } from "@carma-geo/data-structures";
import type { Radians } from "@carma-units";
// ---------------------------------------------------------------------------
// WGS84 ellipsoid constants
// ---------------------------------------------------------------------------

/** WGS84 semi-major axis (equatorial radius) in meters. */
export const WGS84_A = WGS84_ELLIPSOID.semiMajorAxis;
/** WGS84 semi-minor axis (polar radius) in meters. */
export const WGS84_B = WGS84_ELLIPSOID.semiMinorAxis;
/** WGS84 first eccentricity squared. */
export const WGS84_E2 =
  (WGS84_A * WGS84_A - WGS84_B * WGS84_B) / (WGS84_A * WGS84_A);

/** Project the geometric WGS84 limb, without terrain or atmospheric refraction.
 * All angles are radians; height is the camera eye's ellipsoidal height in metres.
 * Pitch is zero at nadir and PI/2 at the local horizontal; bearing is clockwise
 * from north, with zero roll. Screen coordinates are normalized, top-left origin.
 * Non-positive heights have no external tangent limb and return null.
 */
export const projectEllipsoidHorizon = ({
  longitude,
  latitude,
  height,
  bearing,
  pitch,
  verticalFov,
  aspect,
  samples = 720,
}: {
  longitude: number;
  latitude: number;
  height: number;
  bearing: number;
  pitch: number;
  verticalFov: number;
  aspect: number;
  samples?: number;
}): {
  segments: { x: number; y: number }[][];
  centerDepression: number;
} | null => {
  if (
    ![
      longitude,
      latitude,
      height,
      bearing,
      pitch,
      verticalFov,
      aspect,
      samples,
    ].every(Number.isFinite) ||
    height <= 0 ||
    aspect <= 0 ||
    verticalFov <= 0 ||
    verticalFov >= Math.PI
  )
    return null;

  const eye = cartographicToEcef(longitude, latitude, height);
  const up = new Vector3(
    Math.cos(latitude) * Math.cos(longitude),
    Math.cos(latitude) * Math.sin(longitude),
    Math.sin(latitude)
  );
  const east = new Vector3(-Math.sin(longitude), Math.cos(longitude), 0);
  const north = new Vector3().crossVectors(up, east);
  const heading = north
    .clone()
    .multiplyScalar(Math.cos(bearing))
    .addScaledVector(east, Math.sin(bearing));
  const right = east
    .clone()
    .multiplyScalar(Math.cos(bearing))
    .addScaledVector(north, -Math.sin(bearing));
  const forward = heading
    .clone()
    .multiplyScalar(Math.sin(pitch))
    .addScaledVector(up, -Math.cos(pitch));
  const screenUp = heading
    .clone()
    .multiplyScalar(Math.cos(pitch))
    .addScaledVector(up, Math.sin(pitch));
  const scale = new Vector3(1 / WGS84_A, 1 / WGS84_A, 1 / WGS84_B);
  const q = eye.clone().multiply(scale);
  const q2 = q.lengthSq();
  if (q2 <= 1) return null;

  // Scaling the ellipsoid to the unit sphere makes the tangency locus the
  // circle q·p=1, |p|=1. Mapping it back preserves exact ray tangency.
  const axis = q.clone().normalize();
  const u = east.clone().cross(axis).normalize();
  const v = new Vector3().crossVectors(axis, u);
  const center = q.clone().divideScalar(q2);
  const radius = Math.sqrt((q2 - 1) / q2);
  const tangentY = Math.tan(verticalFov / 2);
  const tangentX = tangentY * aspect;
  const count = Math.max(32, Math.min(8192, Math.round(samples)));
  const segments: { x: number; y: number }[][] = [];
  let segment: { x: number; y: number }[] = [];
  // Retain offscreen points so SVG clipping preserves crossings at viewport
  // edges. Break at the eye plane to avoid connecting front/back projections.
  for (let i = 0; i <= count; i++) {
    const angle = (i / count) * (2 * Math.PI);
    const ray = center
      .clone()
      .addScaledVector(u, radius * Math.cos(angle))
      .addScaledVector(v, radius * Math.sin(angle))
      .divide(scale)
      .sub(eye);
    const depth = ray.dot(forward);
    if (depth > 1e-8) {
      segment.push({
        x: 0.5 + ray.dot(right) / (2 * depth * tangentX),
        y: 0.5 - ray.dot(screenUp) / (2 * depth * tangentY),
      });
    } else if (segment.length) {
      if (segment.length > 1) segments.push(segment);
      segment = [];
    }
  }
  if (segment.length > 1) segments.push(segment);

  // Depression at the camera bearing, independent of camera pitch/FOV.
  // Solve the exact ray/ellipsoid discriminant, selecting the forward limb.
  let low = 0;
  let high = Math.PI / 2;
  for (let i = 0; i < 56; i++) {
    const depression = (low + high) / 2;
    const d = heading
      .clone()
      .multiplyScalar(Math.cos(depression))
      .addScaledVector(up, -Math.sin(depression))
      .multiply(scale);
    const b = q.dot(d);
    const discriminant = b * b - d.lengthSq() * (q2 - 1);
    if (discriminant >= 0 && b < 0) high = depression;
    else low = depression;
  }
  return { segments, centerDepression: (low + high) / 2 };
};

// ---------------------------------------------------------------------------
// Cartographic (radians) → ECEF
// ---------------------------------------------------------------------------

/** Prime vertical radius of curvature at a given latitude. */
const primeVerticalRadius = (sinLat: number): number =>
  WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);

/**
 * Convert geodetic (lon, lat, alt) in radians+meters to ECEF Cartesian3.
 * Standard WGS84 formula.
 */
export const cartographicToEcef = (
  longitude: number,
  latitude: number,
  altitude: number,
  out?: Vector3
): Vector3 => {
  const sinLat = Math.sin(latitude);
  const cosLat = Math.cos(latitude);
  const sinLon = Math.sin(longitude);
  const cosLon = Math.cos(longitude);
  const N = primeVerticalRadius(sinLat);

  const x = (N + altitude) * cosLat * cosLon;
  const y = (N + altitude) * cosLat * sinLon;
  const z = (N * (1 - WGS84_E2) + altitude) * sinLat;

  if (out) {
    out.set(x, y, z);
    return out;
  }
  return new Vector3(x, y, z);
};

// ---------------------------------------------------------------------------
// ECEF → Cartographic (radians)
// ---------------------------------------------------------------------------

const ECEF_TO_CARTOGRAPHIC_ITERATIONS = 5;
const ECEF_TO_CARTOGRAPHIC_EPSILON = 1e-12;

export type CartographicRad = {
  readonly longitude: Radians;
  readonly latitude: Radians;
  readonly altitude: Altitude.EllipsoidalWGS84Meters;
};

/**
 * Convert ECEF Cartesian3 to geodetic (lon, lat, alt) in radians+meters.
 * Iterative Bowring method, converges in 2–3 iterations for Earth-scale points.
 */
export const ecefToCartographic = (ecef: Vector3): CartographicRad => {
  const x = ecef.x;
  const y = ecef.y;
  const z = ecef.z;

  const p = Math.sqrt(x * x + y * y);
  const longitude = Math.atan2(y, x);

  // Initial latitude estimate (Bowring)
  let latitude = Math.atan2(z, p * (1 - WGS84_E2));
  let altitude = 0;

  for (let i = 0; i < ECEF_TO_CARTOGRAPHIC_ITERATIONS; i++) {
    const sinLat = Math.sin(latitude);
    const N = primeVerticalRadius(sinLat);
    altitude = p / Math.cos(latitude) - N;
    const newLatitude = Math.atan2(
      z,
      p * (1 - (WGS84_E2 * N) / (N + altitude))
    );
    if (Math.abs(newLatitude - latitude) < ECEF_TO_CARTOGRAPHIC_EPSILON) {
      latitude = newLatitude;
      break;
    }
    latitude = newLatitude;
  }

  return {
    longitude: longitude as Radians,
    latitude: latitude as Radians,
    altitude: altitude as Altitude.EllipsoidalWGS84Meters,
  };
};

// ---------------------------------------------------------------------------
// ENU transform at a reference point
// ---------------------------------------------------------------------------

/**
 * Build the 4×4 ECEF → ENU transform matrix at a given reference ECEF point.
 * ENU axes: +X = east, +Y = north, +Z = up.
 *
 * Replaces Cesium's Transforms.eastNorthUpToFixedFrame and its inverse.
 */
export const ecefToEnuMatrix = (
  referenceEcef: Vector3,
  out?: Matrix4
): Matrix4 => {
  const carto = ecefToCartographic(referenceEcef);
  const lon = carto.longitude as number;
  const lat = carto.latitude as number;

  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);

  // ENU basis vectors in ECEF:
  // east  = (-sinLon,           cosLon,          0)
  // north = (-sinLat * cosLon, -sinLat * sinLon, cosLat)
  // up    = ( cosLat * cosLon,  cosLat * sinLon, sinLat)
  const ex = -sinLon;
  const ey = cosLon;
  const ez = 0;

  const nx = -sinLat * cosLon;
  const ny = -sinLat * sinLon;
  const nz = cosLat;

  const ux = cosLat * cosLon;
  const uy = cosLat * sinLon;
  const uz = sinLat;

  const rx = referenceEcef.x;
  const ry = referenceEcef.y;
  const rz = referenceEcef.z;

  // Translation component: -R * reference
  const tx = -(ex * rx + ey * ry + ez * rz);
  const ty = -(nx * rx + ny * ry + nz * rz);
  const tz = -(ux * rx + uy * ry + uz * rz);

  // Matrix4 in Three.js uses column-major order
  const m = out ?? new Matrix4();
  // prettier-ignore
  m.set(
    ex, ey, ez, tx, // row 0 (east)
    nx, ny, nz, ty, // row 1 (north)
    ux, uy, uz, tz, // row 2 (up)
    0, 0, 0, 1
  );
  return m;
};

/**
 * Transform an ECEF point into the ENU frame centered at `referenceEcef`.
 * Returns { east, north, up } offsets in meters.
 */
export const ecefToEnuOffset = (
  pointEcef: Vector3,
  referenceEcef: Vector3
): { east: number; north: number; up: number } => {
  const m = ecefToEnuMatrix(referenceEcef, _enuMatrixScratch);
  const p = _pointScratch.copy(pointEcef).applyMatrix4(m);
  return { east: p.x, north: p.y, up: p.z };
};

/**
 * Convert an ENU offset at a reference point back to ECEF.
 */
export const enuOffsetToEcef = (
  east: number,
  north: number,
  up: number,
  referenceEcef: Vector3,
  out?: Vector3
): Vector3 => {
  const m = ecefToEnuMatrix(referenceEcef, _enuMatrixScratch);
  const inv = _enuInverseMatrixScratch.copy(m).invert();
  const result = out ?? new Vector3();
  result.set(east, north, up).applyMatrix4(inv);
  return result;
};

// Scratch objects to avoid allocation in hot paths
const _enuMatrixScratch = new Matrix4();
const _enuInverseMatrixScratch = new Matrix4();
const _pointScratch = new Vector3();
