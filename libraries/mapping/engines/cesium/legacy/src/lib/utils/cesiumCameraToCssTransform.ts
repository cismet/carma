import {
  applyRollToHeadingForCameraNearNadir,
  type Camera,
} from "@carma/cesium";
import { clamp } from "@carma-commons/math";

// Compute CSS perspective in px from an FOV angle (radians) and a DOM dimension (px)
export function fovToCssPerspectiveByFov(
  dimPx: number,
  fovRad: number
): number {
  if (!(dimPx > 0) || !(fovRad > 0)) return 0;
  return dimPx / 2 / Math.tan(fovRad / 2);
}

// Compute CSS perspective for a target element using Cesium camera frustum
export function cssPerspectiveFromCesiumCameraForElement(
  targetEl: Element | null | undefined,
  camera: Camera | undefined,
  fallback = 1600
): number {
  if (!targetEl || !camera) return fallback;
  const rect = targetEl.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  const frustum = camera.frustum as unknown as {
    fovy?: number;
    _fovy?: number;
    aspectRatio?: number;
  };
  const fovy: number | undefined = frustum?.fovy ?? frustum?._fovy;
  const aspect: number = frustum?.aspectRatio ?? (w > 0 && h > 0 ? w / h : 1);
  const useW = w >= h;
  const angle =
    typeof fovy === "number" && fovy > 0
      ? useW
        ? 2 * Math.atan(Math.tan(fovy / 2) * aspect)
        : fovy
      : undefined;
  if (typeof angle !== "number" || !(angle > 0)) return fallback;
  const dimPx = useW ? w : h;
  const f = fovToCssPerspectiveByFov(dimPx, angle);
  return clamp(f, 10, 100000);
}

// Cache perspective per element to avoid recomputation when inputs are unchanged
type PerspectiveCache = {
  lastAngle?: number;
  lastW?: number;
  lastH?: number;
  lastPerspective?: number;
};
const perspectiveCache = new WeakMap<Element, PerspectiveCache>();

// Overloads: without element → [scene,inverse]; with element → [scene,inverse,perspective]
export function cesiumCameraToCssTransform(
  camera: Camera,
  opts: { offsetRad: number }
): [string, string];
export function cesiumCameraToCssTransform(
  camera: Camera,
  opts: { offsetRad: number; targetEl: Element | null; fallback?: number }
): [string, string, number];
export function cesiumCameraToCssTransform(
  camera: Camera,
  opts: { offsetRad: number; targetEl?: Element | null; fallback?: number }
) {
  const { offsetRad, targetEl, fallback = 1600 } = opts;
  const headingRad = applyRollToHeadingForCameraNearNadir(camera);
  const mappedPitchRad = camera.pitch + Math.PI / 2; // align top/bottom as default plane
  const headingAdjRad = headingRad - offsetRad; // compensate imagery north offset
  const transform = `rotateX(${mappedPitchRad}rad) rotateZ(${-headingAdjRad}rad)`;
  const inverseTransform = `rotateZ(${headingAdjRad}rad) rotateX(${-mappedPitchRad}rad)`;
  if (typeof targetEl !== "undefined") {
    let perspective = fallback;
    const el = targetEl as Element | null | undefined;
    if (el && camera) {
      // Compute current angle and element dims
      const rect = el.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const frustum = camera.frustum as unknown as {
        fovy?: number;
        _fovy?: number;
        aspectRatio?: number;
      };
      const fovy: number | undefined = frustum?.fovy ?? frustum?._fovy;
      const aspect: number =
        frustum?.aspectRatio ?? (w > 0 && h > 0 ? w / h : 1);
      const useW = w >= h;
      const angle =
        typeof fovy === "number" && fovy > 0
          ? useW
            ? 2 * Math.atan(Math.tan(fovy / 2) * aspect)
            : fovy
          : undefined;

      const cache = perspectiveCache.get(el) ?? {};
      const sameAngle =
        cache.lastAngle !== undefined &&
        angle !== undefined &&
        Math.abs(cache.lastAngle - angle) < 1e-6;
      const sameSize = cache.lastW === w && cache.lastH === h;

      if (sameAngle && sameSize && typeof cache.lastPerspective === "number") {
        perspective = cache.lastPerspective;
      } else {
        const dimPx = useW ? w : h;
        if (angle && dimPx > 0) {
          const f = fovToCssPerspectiveByFov(dimPx, angle);
          perspective = clamp(f, 10, 100000);
          cache.lastPerspective = perspective;
          cache.lastAngle = angle;
          cache.lastW = w;
          cache.lastH = h;
          perspectiveCache.set(el, cache);
        } else {
          perspective = fallback;
        }
      }
    }
    return [transform, inverseTransform, perspective] as [
      string,
      string,
      number
    ];
  }
  return [transform, inverseTransform] as [string, string];
}
