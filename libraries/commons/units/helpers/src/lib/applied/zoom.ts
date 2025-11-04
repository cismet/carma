import type { Zoom } from "@carma/units/types";

/**
 * Default zoom tolerance (no perceptible visual difference at 1/1000)
 */
const DEFAULT_ZOOM_TOLERANCE = 0.001;

export const isZoom = (zoom: unknown): zoom is Zoom => {
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
