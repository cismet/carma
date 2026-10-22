import { Vector3 } from "three";
import {
  degToRadNumeric,
  radToDegNumeric,
  type Degrees,
  type Meters,
  type MetricVector3,
} from "@carma-units";

import {
  cartographicToEcef,
  ecefToCartographic,
  ecefToEnuOffset,
  readEnuAxesAtEcef,
} from "./geodetic";

/** WGS84 longitude and latitude in degrees, ellipsoidal height in meters. */
export type GeographicCoordinate = {
  longitude: number;
  latitude: number;
  altitude: number;
};

type GeographicCoordinateDeg = GeographicCoordinate & {
  longitude: Degrees;
  latitude: Degrees;
  altitude: Meters;
};

const DIRECTION_EPSILON_SQUARED = 1e-12;

export const ecefFromGeographicCoordinate = (
  coordinate: GeographicCoordinate,
  out?: Vector3
): Vector3 =>
  cartographicToEcef(
    degToRadNumeric(coordinate.longitude),
    degToRadNumeric(coordinate.latitude),
    coordinate.altitude,
    out
  );

export const geographicCoordinateFromEcef = (
  positionECEF: Vector3
): GeographicCoordinateDeg => {
  const cartographic = ecefToCartographic(positionECEF);
  return {
    longitude: radToDegNumeric(cartographic.longitude) as Degrees,
    latitude: radToDegNumeric(cartographic.latitude) as Degrees,
    altitude: cartographic.altitude as Meters,
  };
};

/** Geocentric up: the normalised position. */
export const getLocalUpDirectionAtAnchor = (
  anchorECEF: Vector3,
  out: Vector3 = new Vector3()
): Vector3 =>
  out.copy(anchorECEF).lengthSq() > DIRECTION_EPSILON_SQUARED
    ? out.normalize()
    : out.set(0, 0, 1);

/** Geodetic up: the ellipsoid normal under the anchor. */
export const getEllipsoidalUpDirectionAtAnchor = (
  anchorECEF: Vector3,
  out: Vector3 = new Vector3()
): Vector3 => out.copy(readEnuAxesAtEcef(anchorECEF).up);

/**
 * Chord interpolation re-projected onto the ellipsoid, altitude blended; for
 * short edges it stays far below the geodesic error that would matter.
 */
export const interpolateGeographicCoordinate = (
  start: GeographicCoordinate,
  end: GeographicCoordinate,
  fraction: number
): GeographicCoordinate => {
  const chord = ecefFromGeographicCoordinate({ ...start, altitude: 0 }).lerp(
    ecefFromGeographicCoordinate({ ...end, altitude: 0 }),
    fraction
  );
  const { longitude, latitude } = ecefToCartographic(chord);
  return {
    longitude: radToDegNumeric(longitude),
    latitude: radToDegNumeric(latitude),
    altitude: start.altitude + (end.altitude - start.altitude) * fraction,
  };
};

/** Horizontal distance on the ellipsoid surface, altitude ignored. */
export const getGeographicSurfaceDistance = (
  start: GeographicCoordinate,
  end: GeographicCoordinate
): Meters => {
  const offset = ecefToEnuOffset(
    ecefFromGeographicCoordinate({ ...end, altitude: 0 }),
    ecefFromGeographicCoordinate({ ...start, altitude: 0 })
  );
  return Math.hypot(offset.east, offset.north) as Meters;
};

export const vector3FromMetricVector3 = (
  vector: MetricVector3,
  out: Vector3 = new Vector3()
): Vector3 => out.set(vector.x, vector.y, vector.z);

export const metricVector3FromVector3 = (vector: Vector3): MetricVector3 => ({
  x: vector.x as Meters,
  y: vector.y as Meters,
  z: vector.z as Meters,
});
