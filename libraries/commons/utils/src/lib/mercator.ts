import {
  EARTH_CIRCUMFERENCE,
  DEFAULT_LEAFLET_TILESIZE,
  WEB_MERCATOR_MAX_LATITUDE_RAD,
} from "./constants";
import { asRadians, asMeters, unMeters, unRad } from "./units";
import type { Radians, Meters } from "@carma-commons/types";

export const clampLatitudeRadiansToWebMercatorExtent = (
  latitude: number
): number => {
  if (latitude > WEB_MERCATOR_MAX_LATITUDE_RAD) {
    console.warn(
      "latitude is greater than max web mercator latitude, clamping applied"
    );
    return WEB_MERCATOR_MAX_LATITUDE_RAD;
  }
  if (latitude < -WEB_MERCATOR_MAX_LATITUDE_RAD) {
    console.warn(
      "latitude is smaller than min web mercator latitude, clamping applied"
    );
    return -WEB_MERCATOR_MAX_LATITUDE_RAD;
  }
  return latitude;
};

export const getMercatorScaleFactorAtLatitudeRad = (
  latitude: number
): number => {
  const latRadClamped = clampLatitudeRadiansToWebMercatorExtent(latitude);
  const latRad: Radians = asRadians(latRadClamped);
  return 1 / Math.cos(unRad(latRad));
};

export const getZoomFromPixelResolutionAtLatitudeRad = (
  meterResolution: number,
  latitude: number = 0,
  { tileSize = DEFAULT_LEAFLET_TILESIZE }: { tileSize?: number } = {}
) => {
  const scaleFactor = getMercatorScaleFactorAtLatitudeRad(latitude);
  const mPerPx: Meters = asMeters(meterResolution);
  const denominator = scaleFactor * unMeters(mPerPx) * tileSize;
  const zoom = Math.log2(EARTH_CIRCUMFERENCE / denominator);
  return zoom;
};

export const getPixelResolutionFromZoomAtLatitudeRad = (
  zoom: number,
  latitude: number = 0,
  { tileSize = DEFAULT_LEAFLET_TILESIZE }: { tileSize?: number } = {}
) => {
  const scale = getMercatorScaleFactorAtLatitudeRad(latitude);
  const metersPerPixel: Meters = asMeters(
    EARTH_CIRCUMFERENCE / (scale * Math.pow(2, zoom) * tileSize)
  );
  return unMeters(metersPerPixel);
};
