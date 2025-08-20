import { distance } from "@turf/turf";
import {
  DEFAULT_LEAFLET_TILESIZE,
  DEFAULT_ZOOM_TOLERANCE,
  DEFAULT_PIXEL_TOLERANCE,
} from "./constants";
import { getPixelResolutionFromZoomAtLatitudeRad } from "./mercator";
import { asDegrees, degToRad } from "./units";
import type { Degrees, Radians } from "@carma-commons/types";

export type LatLng = { lat: number; lng: number };
export type LatLngZoom = { lat: number; lng: number; zoom: number };

// Meters per pixel at zoom/latitude (latitude in degrees)
export function metersPerPixel(zoom: number, latitudeDeg?: number): number {
  const latDeg = latitudeDeg ?? 50; // default ~50°
  const latDegBranded: Degrees = asDegrees(latDeg);
  const latRad: Radians = degToRad(latDegBranded);
  return getPixelResolutionFromZoomAtLatitudeRad(zoom, latRad, {
    tileSize: DEFAULT_LEAFLET_TILESIZE,
  });
}

// Geodesic distance in meters between two LatLngs (degrees)
export function distanceMeters(a: LatLng, b: LatLng): number {
  return distance([a.lng, a.lat], [b.lng, b.lat], { units: "meters" });
}

export function pixelsBetweenLocations(
  a: LatLng,
  b: LatLng,
  zoomRef: number
): number {
  // Use max |latitude| of both points for Mercator scale
  const latForScale = Math.max(Math.abs(a.lat || 0), Math.abs(b.lat || 0));
  const mPerPx = metersPerPixel(zoomRef, latForScale);
  const dMeters = distanceMeters(a, b);
  return dMeters / mPerPx;
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
  const px = pixelsBetweenLocations(
    { lat: a.lat, lng: a.lng },
    { lat: b.lat, lng: b.lng },
    b.zoom
  );
  return px <= pxTol;
}
