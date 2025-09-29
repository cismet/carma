import type { Zoom } from "@carma/types";
import { DEFAULT_ZOOM_TOLERANCE } from "./constants";

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
