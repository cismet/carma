import { distance } from "@turf/turf";
import {
  DEFAULT_LEAFLET_TILESIZE,
  DEFAULT_MERCATOR_LATITUDE_RAD,
  DEFAULT_ZOOM_LEVEL,
  DEFAULT_PIXEL_TOLERANCE,
} from "./constants/web-map";

import type { Degrees, Meters, Radians } from "@carma/units/types";

import {
  brandedRatio,
  brandedAbs,
  brandedMax,
  degToRad,
  isZoom,
  isZoomClose,
} from "@carma/units/helpers";

import { LatLng } from "@carma/geo/types";
import { getPixelResolutionFromZoomAtLatitudeRad } from "./mercator";

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
export function distanceMeters(a: LatLng.deg, b: LatLng.deg): number {
  return distance([a.longitude, a.latitude], [b.longitude, b.latitude], {
    units: "meters",
  });
}

export function pixelsBetweenGeographicLocations(
  a: LatLng.deg,
  b: LatLng.deg,
  zoomRef: number
): number {
  // Use max |latitude| of both points for Mercator scale
  const latForScale = brandedMax(
    brandedAbs(a.latitude),
    brandedAbs(b.latitude)
  );
  const mPerPx = metersPerPixel(zoomRef, latForScale);
  const dMeters = distanceMeters(a, b);
  return brandedRatio(dMeters, mPerPx);
}

export function isLocationVisuallyEquivalentAtZoom(
  a: LatLng.deg | undefined,
  b: LatLng.deg | undefined,
  opts?: {
    zoom?: number;
    pixelTolerance?: number; // pixels
  }
): boolean {
  if (!a || !b) return false;
  const pxTol = opts?.pixelTolerance ?? DEFAULT_PIXEL_TOLERANCE;
  const zoom = opts?.zoom ?? DEFAULT_ZOOM_LEVEL;
  const px = pixelsBetweenGeographicLocations(a, b, zoom);
  return px <= pxTol;
}

// Composite predicate: both center and zoom are equivalent within tolerances
export function isMapCenterZoomEquivalent(
  a: { center: LatLng.deg; zoom: number },
  b: { center: LatLng.deg; zoom: number },
  opts?: { pixelTolerance?: number; zoomTolerance?: number }
): boolean {
  if (!isZoom(a.zoom) || !isZoom(b.zoom)) {
    return false;
  }
  const zoomClose = isZoomClose(a.zoom, b.zoom, opts?.zoomTolerance);
  if (!zoomClose) return false;
  const pixelOptions: { zoom: number; pixelTolerance?: number } = {
    zoom: a.zoom,
  };
  if (opts?.pixelTolerance !== undefined) {
    pixelOptions.pixelTolerance = opts.pixelTolerance;
  }
  return isLocationVisuallyEquivalentAtZoom(a.center, b.center, pixelOptions);
}
