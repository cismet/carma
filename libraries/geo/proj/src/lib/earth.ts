import type { Meters } from "@carma-units";

import { WGS84_ELLIPSOID } from "./ellipsoids";

/**
 * Equatorial circumference of the WGS84 ellipsoid, 2 * pi * a. Web Mercator
 * (EPSG:3857) is defined on the sphere of radius a, so tile extents, zoom and
 * pixel resolution derive from this value, never from the mean radius.
 */
export const EARTH_CIRCUMFERENCE: Meters = (2 *
  Math.PI *
  WGS84_ELLIPSOID.semiMajorAxis) as Meters;

/**
 * IUGG mean radius R1 = (2a + b) / 3 of the WGS84 ellipsoid, 6371008.7714 m.
 * For spherical approximations: great-circle distances, metres per degree,
 * screen-error budgets. Turf's 6371008.8 is this value rounded.
 */
export const EARTH_RADIUS: Meters = ((2 * WGS84_ELLIPSOID.semiMajorAxis +
  WGS84_ELLIPSOID.semiMinorAxis) /
  3) as Meters;
