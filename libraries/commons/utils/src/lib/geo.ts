import { distance } from "@turf/turf";

export type LatLng = { lat: number; lng: number };
export type LatLngZoom = { lat: number; lng: number; zoom: number };

export function metersPerPixel(zoom: number, latitude?: number): number {
  // Default to ~50° latitude if none provided
  const lat = latitude ?? 50;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const metersPerPixelAtEquator = 156543.03392804097; // Web Mercator
  return (metersPerPixelAtEquator * cosLat) / Math.pow(2, zoom);
}

export function distanceMeters(a: LatLng, b: LatLng): number {
  // Turf distance in kilometers by default; specify meters
  return distance([a.lng, a.lat], [b.lng, b.lat], { units: "meters" });
}

export function pixelsBetweenLocations(
  a: LatLng,
  b: LatLng,
  zoomRef: number
): number {
  // Use the maximum absolute latitude of the two points for Web Mercator scale
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
    pixelTolerance?: number; // in pixels
    zoomTolerance?: number; // absolute zoom diff
  }
): boolean {
  if (!a || !b) return false;
  const pxTol = opts?.pixelTolerance ?? 2; // default 2px
  const zoomTol = opts?.zoomTolerance ?? 1e-6;
  if (!isZoomClose(a.zoom, b.zoom, zoomTol)) return false;
  const px = pixelsBetweenLocations(
    { lat: a.lat, lng: a.lng },
    { lat: b.lat, lng: b.lng },
    // use the target zoom to compute pixels at the on-screen scale we will write at
    b.zoom
  );
  return px <= pxTol;
}
