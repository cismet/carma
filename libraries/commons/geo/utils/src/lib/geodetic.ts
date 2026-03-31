import { Matrix4, Vector3 } from "three";

import type { Altitude } from "@carma/geo/types";
import type { Radians } from "@carma/units/types";
// ---------------------------------------------------------------------------
// WGS84 ellipsoid constants
// ---------------------------------------------------------------------------

/** WGS84 semi-major axis (equatorial radius) in meters. */
export const WGS84_A = 6378137.0;
/** WGS84 semi-minor axis (polar radius) in meters. */
export const WGS84_B = 6356752.314245;
/** WGS84 first eccentricity squared. */
export const WGS84_E2 =
  (WGS84_A * WGS84_A - WGS84_B * WGS84_B) / (WGS84_A * WGS84_A);

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
