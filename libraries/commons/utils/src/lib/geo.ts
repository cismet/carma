import { distance } from "@turf/turf";
import {
  DEFAULT_LEAFLET_TILESIZE,
  DEFAULT_MERCATOR_LATITUDE_RAD,
  DEFAULT_ZOOM_TOLERANCE,
  DEFAULT_PIXEL_TOLERANCE,
} from "./constants";
import { getPixelResolutionFromZoomAtLatitudeRad } from "./mercator";
import { degToRad } from "./units";
import type {
  Degrees,
  Meters,
  Radians,
  LatLng,
  LatLngZoom,
} from "@carma-commons/types";
import { brandedRatio, brandedAbs, brandedMax } from "./typescript-branded-ops";

// Meters per pixel at zoom/latitude (latitude in degrees)
export function metersPerPixel(zoom: number, latitudeDeg?: Degrees): Meters {
  return metersPerPixelAtLatitudeRad(zoom, degToRad(latitudeDeg));
}

// Meters per pixel at zoom/latitude (latitude in degrees)
export function metersPerPixelAtLatitudeRad(
  zoom: number,
  latitudeRad?: Radians
): Meters {
  return getPixelResolutionFromZoomAtLatitudeRad(
    zoom,
    latitudeRad ?? DEFAULT_MERCATOR_LATITUDE_RAD,
    {
      tileSize: DEFAULT_LEAFLET_TILESIZE,
    }
  );
}

// Geodesic distance in meters between two LatLngs (degrees)
export function distanceMeters(a: LatLng, b: LatLng): number {
  return distance([a.lng, a.lat], [b.lng, b.lat], { units: "meters" });
}

export function pixelsBetweenGeographicLocations(
  a: LatLng,
  b: LatLng,
  zoomRef: number
): number {
  // Use max |latitude| of both points for Mercator scale
  const latForScale = brandedMax(brandedAbs(a.lat), brandedAbs(b.lat));
  const mPerPx = metersPerPixel(zoomRef, latForScale);
  const dMeters = distanceMeters(a, b);
  return brandedRatio(dMeters, mPerPx);
}

export function isZoomClose(
  a: number | undefined,
  b: number | undefined,
  tol: number = 1e-6
): boolean {
  return (
    Number.isFinite(a) &&
    Number.isFinite(b) &&
    Math.abs((a as number) - (b as number)) < tol
  );
}

export function isLocationEqualWithinPixelTolerance(
  a: LatLngZoom | undefined,
  b: LatLngZoom | undefined,
  opts?: {
    pixelTolerance?: number; // pixels
    zoomTolerance?: number; // absolute diff
  }
): boolean {
  if (!a || !b) return false;
  const pxTol = opts?.pixelTolerance ?? DEFAULT_PIXEL_TOLERANCE;
  const zoomTol = opts?.zoomTolerance ?? DEFAULT_ZOOM_TOLERANCE;
  if (!isZoomClose(a.zoom, b.zoom, zoomTol)) return false;
  const px = pixelsBetweenGeographicLocations(a, b, b.zoom);
  return px <= pxTol;
}
