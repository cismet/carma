import { clamp } from "./numbers";

export function fovToCssPerspectiveByFov(
  dimPx: number,
  fovRad: number
): number {
  if (!(dimPx > 0) || !(fovRad > 0)) return 0;
  const f = dimPx / 2 / Math.tan(fovRad / 2);
  return f;
}

export type CesiumFrustumLike = {
  /** FOV in radians. Will be treated as horizontal if width>=height, else vertical. */
  fov?: number;
};

export function cssPerspectiveFromCesiumFrustum(
  containerWidthPx: number,
  containerHeightPx: number,
  frustum: CesiumFrustumLike | undefined,
  fallback = 1600
): number {
  const angle = frustum?.fov;
  if (!frustum || typeof angle !== "number" || !(angle > 0)) return fallback;
  const dimPx = Math.max(containerWidthPx, containerHeightPx);
  const f = fovToCssPerspectiveByFov(dimPx, angle);
  return clamp(f, 10, 100000);
}

export function cssPerspectiveFromCesiumFrustumForElement(
  targetEl: Element | null | undefined,
  frustum: CesiumFrustumLike | undefined,
  fallback = 1600
): number {
  if (!targetEl || !frustum) return fallback;
  const rect = targetEl.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  return cssPerspectiveFromCesiumFrustum(w, h, frustum, fallback);
}
