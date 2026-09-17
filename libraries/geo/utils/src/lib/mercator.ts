import { degToRad, brandedNegate } from "@carma-units";
import type { Radians, Meters, Degrees } from "@carma-units";

import { EARTH_CIRCUMFERENCE } from "./constants/earth";
import { WGS84_A } from "./geodetic";
import {
  DEFAULT_LEAFLET_TILESIZE,
  DEFAULT_MERCATOR_LATITUDE_RAD,
  WEB_MERCATOR_MAX_LATITUDE_RAD,
} from "./constants/web-map";

export const clampLatitudeToWebMercatorExtent = (
  latitude: Radians
): Radians => {
  if (latitude > WEB_MERCATOR_MAX_LATITUDE_RAD) {
    console.warn(
      "latitude is greater than max web mercator latitude, clamping applied"
    );
    return WEB_MERCATOR_MAX_LATITUDE_RAD;
  }
  const minMercator = brandedNegate(WEB_MERCATOR_MAX_LATITUDE_RAD);
  if (latitude < minMercator) {
    console.warn(
      "latitude is smaller than min web mercator latitude, clamping applied"
    );
    return minMercator;
  }
  return latitude;
};

/**
 * Forward WGS84 (EPSG:4326) to Web Mercator (EPSG:3857) in metres.
 *
 * Deliberately not taken from `@carma-geo/proj`: that package depends on
 * `@carma-commons/resources`, which depends back on this one, so importing it
 * here closes a build cycle (ADR-008 package layering). EPSG:3857 is defined
 * with spherical formulas on the WGS84 semi-major axis, so this is the
 * definition rather than an approximation of the proj4 result. Latitudes are
 * not clamped, matching proj4's forward transform.
 */
export const getWebMercatorFromWgs84Deg = (
  longitude: Degrees,
  latitude: Degrees
): [Meters, Meters] => {
  const lambda = degToRad(longitude);
  const phi = degToRad(latitude);
  return [
    (WGS84_A * lambda) as Meters,
    (WGS84_A * Math.log(Math.tan(Math.PI / 4 + phi / 2))) as Meters,
  ];
};

export const getMercatorScaleFactorAtLatitudeRad = (
  latitude: Radians
): number => {
  const clampedLatitude: Radians = clampLatitudeToWebMercatorExtent(latitude);
  return 1 / Math.cos(clampedLatitude);
};

export const getMercatorScaleFactorAtLatitudeDeg = (
  latitude: Degrees
): number => {
  const latRad = degToRad(latitude);
  return getMercatorScaleFactorAtLatitudeRad(latRad);
};

export const getZoomFromPixelResolutionAtLatitudeRad = (
  meterResolution: Meters,
  latitude: Radians = DEFAULT_MERCATOR_LATITUDE_RAD,
  { tileSize = DEFAULT_LEAFLET_TILESIZE }: { tileSize?: number } = {}
): number => {
  const scaleFactor = getMercatorScaleFactorAtLatitudeRad(latitude);
  const denominator = scaleFactor * meterResolution * tileSize;
  const zoom = Math.log2(EARTH_CIRCUMFERENCE / denominator);
  return zoom;
};

export const getPixelResolutionFromZoomAtLatitudeRad = (
  zoom: number,
  latitude: Radians,
  { tileSize = DEFAULT_LEAFLET_TILESIZE }: { tileSize?: number } = {}
): Meters => {
  const scale = getMercatorScaleFactorAtLatitudeRad(latitude);
  const metersPerPixel: Meters = (EARTH_CIRCUMFERENCE /
    (scale * Math.pow(2, zoom) * tileSize)) as Meters;
  return metersPerPixel;
};
