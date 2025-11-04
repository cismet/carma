import { EARTH_CIRCUMFERENCE } from "./constants/earth";
import {
  DEFAULT_LEAFLET_TILESIZE,
  DEFAULT_MERCATOR_LATITUDE_RAD,
  WEB_MERCATOR_MAX_LATITUDE_RAD,
} from "./constants/web-map";
import { degToRad, brandedNegate } from "@carma/units/helpers";
import type { Radians, Meters, Degrees } from "@carma/units/types";

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
