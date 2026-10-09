import { Vector3 } from "three";
import {
  cartographicToEcef,
  ecefToCartographic,
  ecefToEnuOffset,
} from "@carma-geo/proj";
import {
  degToRadNumeric,
  radToDegNumeric,
  type Degrees,
  type Meters,
  type MetricVector3,
} from "@carma-units";

import type { AnnotationGeographicCoordinate } from "../types/annotation-geographic-coordinate";

/**
 * ECEF geometry helpers for the annotation stack: `THREE.Vector3` in metres on
 * the WGS84 ellipsoid (EPSG:4978), the same frame the Cesium runtime used with
 * `Cartesian3`. Ports of the `@carma-mapping/engines/cesium/core` helpers the
 * annotations consumed before the engine-adapter split.
 */

const DIRECTION_EPSILON_SQUARED = 1e-12;

/** Port of `cartesian3FromGeographicCoordinate` / `Cartesian3.fromDegrees`. */
export const ecefFromGeographicCoordinate = (
  coordinate: AnnotationGeographicCoordinate,
  out?: Vector3
): Vector3 =>
  cartographicToEcef(
    degToRadNumeric(coordinate.longitude),
    degToRadNumeric(coordinate.latitude),
    coordinate.altitude,
    out
  );

/** Branded view of a geographic coordinate; assignable to the plain DTO. */
export type AnnotationGeographicCoordinateDeg = AnnotationGeographicCoordinate & {
  longitude: Degrees;
  latitude: Degrees;
  altitude: Meters;
};

/** Port of `geographicCoordinateFromCartesian3` / `getDegreesFromCartesian`. */
export const geographicCoordinateFromEcef = (
  positionECEF: Vector3
): AnnotationGeographicCoordinateDeg => {
  const cartographic = ecefToCartographic(positionECEF);
  return {
    longitude: radToDegNumeric(cartographic.longitude) as Degrees,
    latitude: radToDegNumeric(cartographic.latitude) as Degrees,
    altitude: cartographic.altitude as Meters,
  };
};

/** Port of `getEllipsoidalAltitudeOrZero`. */
export const getEllipsoidalAltitudeOrZero = (
  altitude: number | null | undefined
): Meters => (altitude ?? 0) as Meters;

/**
 * Port of `getLocalUpDirectionAtAnchor`: the geocentric up, the normalised
 * position itself. Kept apart from the geodetic normal below because the
 * Cesium runtime used both deliberately.
 */
export const getLocalUpDirectionAtAnchor = (
  anchorECEF: Vector3,
  out: Vector3 = new Vector3()
): Vector3 => {
  out.copy(anchorECEF);
  return out.lengthSq() > DIRECTION_EPSILON_SQUARED
    ? out.normalize()
    : out.set(0, 0, 1);
};

/**
 * Port of `getEllipsoidalUpDirectionAtAnchor` / `Ellipsoid.geodeticSurfaceNormal`:
 * the geodetic up at the anchor's latitude and longitude.
 */
export const getEllipsoidalUpDirectionAtAnchor = (
  anchorECEF: Vector3,
  out: Vector3 = new Vector3()
): Vector3 => {
  const { longitude, latitude } = ecefToCartographic(anchorECEF);
  const cosLat = Math.cos(latitude);
  return out.set(
    cosLat * Math.cos(longitude),
    cosLat * Math.sin(longitude),
    Math.sin(latitude)
  );
};

/** Port of `getPositionWithVerticalOffsetFromAnchor` (geocentric up). */
export const getPositionWithVerticalOffsetFromAnchor = (
  anchorECEF: Vector3,
  verticalOffsetMeters: number
): Vector3 =>
  getLocalUpDirectionAtAnchor(anchorECEF)
    .multiplyScalar(verticalOffsetMeters)
    .add(anchorECEF);

/** Port of `CarmaTransforms.getEastNorthUpOffset`. */
export const getEastNorthUpOffset = (
  pointECEF: Vector3,
  referenceECEF: Vector3
): { east: number; north: number; up: number } =>
  ecefToEnuOffset(pointECEF, referenceECEF);

/** Port of `offsetCartesian3Positions`. */
export const offsetEcefPositions = (
  positions: readonly Vector3[],
  offset: Vector3
): Vector3[] => positions.map((position) => position.clone().add(offset));

/** Port of `cartesian3Distance`. */
export const ecefDistance = (left: Vector3, right: Vector3): number =>
  left.distanceTo(right);

/**
 * Chord interpolation between two geographic coordinates, re-projected onto
 * the ellipsoid at the linearly interpolated altitude. Stands in for Cesium's
 * `EllipsoidGeodesic.interpolateUsingFraction` on the short edges the
 * annotations measure; the deviation from the true geodesic stays far below
 * the edge-crossing tolerances.
 */
export const interpolateGeographicCoordinate = (
  start: AnnotationGeographicCoordinate,
  end: AnnotationGeographicCoordinate,
  fraction: number
): AnnotationGeographicCoordinate => {
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

/** Surface distance between two coordinates, altitude ignored. */
export const getGeographicSurfaceDistance = (
  start: AnnotationGeographicCoordinate,
  end: AnnotationGeographicCoordinate
): number => {
  const offset = ecefToEnuOffset(
    ecefFromGeographicCoordinate({ ...end, altitude: 0 }),
    ecefFromGeographicCoordinate({ ...start, altitude: 0 })
  );
  return Math.hypot(offset.east, offset.north);
};

/** Port of `cartesian3FromMetricVector3`: plain metric carrier to `Vector3`. */
export const vector3FromMetricVector3 = (
  vector: MetricVector3,
  out: Vector3 = new Vector3()
): Vector3 => out.set(vector.x, vector.y, vector.z);

/** Port of `cartesian3ToMetricVector3`: `Vector3` to the plain metric carrier. */
export const metricVector3FromVector3 = (vector: Vector3): MetricVector3 => ({
  x: vector.x as Meters,
  y: vector.y as Meters,
  z: vector.z as Meters,
});
