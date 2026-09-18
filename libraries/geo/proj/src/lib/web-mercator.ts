import { degToRad, radToDeg } from "@carma-units";
import type { Degrees, Meters, Radians } from "@carma-units";

import { WGS84_ELLIPSOID } from "./ellipsoids";

/**
 * Forward WGS84 (EPSG:4326) to Web Mercator (EPSG:3857) in metres.
 *
 * EPSG:3857 is defined with spherical formulas on the WGS84 semi-major axis,
 * so this closed form is the definition, not an approximation of the proj4
 * result, and it keeps the branded degree and metre types instead of a
 * generic converter coordinate. It needs no proj4: this module has no
 * side effects and no proj4 import, so a consumer of the closed forms alone
 * bundles neither the generators nor their definitions. Latitudes are not
 * clamped, matching proj4's forward transform.
 */
export const getWebMercatorFromWgs84Deg = (
  longitude: Degrees,
  latitude: Degrees
): [Meters, Meters] => {
  const a = WGS84_ELLIPSOID.semiMajorAxis;
  const lambda = degToRad(longitude);
  const phi = degToRad(latitude);
  return [
    (a * lambda) as Meters,
    (a * Math.log(Math.tan(Math.PI / 4 + phi / 2))) as Meters,
  ];
};

/** Inverse of `getWebMercatorFromWgs84Deg`: Web Mercator metres to degrees. */
export const getWgs84DegFromWebMercator = (
  easting: Meters,
  northing: Meters
): [Degrees, Degrees] => {
  const a = WGS84_ELLIPSOID.semiMajorAxis;
  return [
    radToDeg((easting / a) as Radians),
    radToDeg((2 * Math.atan(Math.exp(northing / a)) - Math.PI / 2) as Radians),
  ];
};
