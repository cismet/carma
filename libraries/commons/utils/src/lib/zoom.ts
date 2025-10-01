import type { Zoom, Zoom256, Zoom512 } from "@carma/types";
import { DEFAULT_ZOOM_TOLERANCE } from "./constants";

// proper relation would be log2 of tilesize / 256 but this is a fixed relation for maplibre and leaflet
// const zoomDelta = Math.log2(tilesize / 256);

export const zoom512as256 = (zoom512: Zoom512): Zoom256 => {
  return (zoom512 + 1) as Zoom256;
};

export const zoom256as512 = (zoom256: Zoom256): Zoom512 => {
  return (zoom256 - 1) as Zoom512;
};

export const isZoom = (zoom: unknown): zoom is Zoom256 => {
  if (typeof zoom !== "number" || !Number.isFinite(zoom)) {
    return false;
  }
  return true;
};

export function isZoomClose(
  a: Zoom,
  b: Zoom,
  tol: number = DEFAULT_ZOOM_TOLERANCE
): boolean {
  return Math.abs(a - b) < tol;
}
