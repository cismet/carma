// Move-gizmo disc sizing (cismet/wupp#4078).
//
// Intent: the disc is a *known-scale reference object* in the scene — a
// world-anchored ruler the user can read a real size off, not just a manipulator
// handle. So unlike a typical editor gizmo (three.js TransformControls, Blender,
// Unity, …) which holds a constant *pixel* size, this disc holds a constant
// *world* size and reads as a recognizable round measure. The model is borrowed
// from map scale bars / graticules (Leaflet, OpenLayers, MapLibre, QGIS): pick a
// round real-world length and only step it on a meaningful zoom change. The
// 1-2-5 series is the classic "nice numbers" choice (Heckbert, Graphics Gems,
// 1990; also D3 ticks, matplotlib locators).
//
// Sizing has two independent dimensions:
//   1. Quantization — the world radius is either continuous, or snapped to a
//      1-2-5 decade series (…, 0.5, 1, 2, 5, 10, 20, 50, …) so the disc reads as
//      a recognizable round size and jumps between steps instead of breathing.
//   2. Resize trigger (managed by the caller):
//      - `camera`: recompute every frame to hold a target screen size (the
//        conventional constant-pixel manipulator behaviour).
//      - `selection`: hold the world size fixed for the whole selection and
//        only step to the next size once the on-screen resolution doubles or
//        halves — the scale-bar rule, with hysteresis so it stays stable while
//        panning/orbiting. See `shouldRestepGizmoDisc`.
//
// This module owns dimension 1 and the pure step decision; dimension 2's
// bookkeeping (measuring scale, holding the frozen value) is a caller concern.

export const GIZMO_DISC_RESIZE_TRIGGERS = {
  CAMERA: "camera",
  SELECTION: "selection",
} as const;

export type GizmoDiscResizeTrigger =
  (typeof GIZMO_DISC_RESIZE_TRIGGERS)[keyof typeof GIZMO_DISC_RESIZE_TRIGGERS];

const NICE_STEP_MANTISSAS = [1, 2, 5, 10] as const;

// Snap a positive value to the nearest entry of the 1-2-5 decade series.
export const snapWorldRadiusToNiceStep = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    return value;
  }
  const decade = 10 ** Math.floor(Math.log10(value));
  let nearest = NICE_STEP_MANTISSAS[0] * decade;
  for (const mantissa of NICE_STEP_MANTISSAS) {
    const candidate = mantissa * decade;
    if (Math.abs(candidate - value) < Math.abs(nearest - value)) {
      nearest = candidate;
    }
  }
  return nearest;
};

export type ResolveGizmoDiscWorldRadiusInput = {
  // Desired on-screen disc radius in pixels.
  targetScreenPx: number;
  // Projected pixels per world unit at the disc origin.
  pixelPerWorld: number;
  // Snap the result to the 1-2-5 series when true.
  quantize: boolean;
};

// World radius that renders at ~targetScreenPx for the given projection scale,
// optionally quantized to the 1-2-5 series.
export const resolveGizmoDiscWorldRadius = ({
  targetScreenPx,
  pixelPerWorld,
  quantize,
}: ResolveGizmoDiscWorldRadiusInput): number => {
  if (!Number.isFinite(pixelPerWorld) || pixelPerWorld <= 0) {
    return targetScreenPx > 0 ? targetScreenPx : 0;
  }
  const continuousRadius = targetScreenPx / pixelPerWorld;
  return quantize
    ? snapWorldRadiusToNiceStep(continuousRadius)
    : continuousRadius;
};

// Factor by which the on-screen resolution must change before the disc moves
// to the next size step. 2 → the disc only re-steps once the camera has zoomed
// in or out far enough to double or halve the pixels-per-world at screen centre.
export const GIZMO_DISC_STEP_FACTOR = 2;

// Whether the disc should re-evaluate its size step. The world size is held
// fixed across a selection; it only changes once the projection scale at screen
// centre has doubled or halved relative to when the current step was set. This
// hysteresis keeps the disc stable during normal panning/orbiting and only
// jumps on a meaningful zoom change. (cismet/wupp#4078)
export const shouldRestepGizmoDisc = (
  referenceScale: number,
  currentScale: number,
  factor: number = GIZMO_DISC_STEP_FACTOR
): boolean => {
  // No usable reference yet → step now to establish one.
  if (!Number.isFinite(referenceScale) || referenceScale <= 0) {
    return true;
  }
  // No usable current scale → keep the existing step.
  if (!Number.isFinite(currentScale) || currentScale <= 0) {
    return false;
  }
  const ratio = currentScale / referenceScale;
  return ratio >= factor || ratio <= 1 / factor;
};

export type GizmoDiscSegmentOptions = {
  // Smallest segment count, so even tiny discs stay smooth.
  minSegments?: number;
  // Upper bound, to cap geometry/DOM work for very large discs.
  maxSegments?: number;
  // Desired on-screen length of one polygon edge, in pixels.
  targetEdgePx?: number;
};

const DEFAULT_DISC_SEGMENT_OPTIONS: Required<GizmoDiscSegmentOptions> = {
  minSegments: 48,
  maxSegments: 256,
  targetEdgePx: 2.5,
};

// Segment count for a disc/ring so its polygon edges read as a smooth circle.
// Scales with the on-screen radius: the larger the disc appears, the more
// segments are needed to keep each edge near `targetEdgePx`. Clamped so small
// discs are not under-tessellated and huge discs do not explode geometry cost.
export const computeGizmoDiscSegments = (
  screenRadiusPx: number,
  options: GizmoDiscSegmentOptions = {}
): number => {
  const { minSegments, maxSegments, targetEdgePx } = {
    ...DEFAULT_DISC_SEGMENT_OPTIONS,
    ...options,
  };
  if (!Number.isFinite(screenRadiusPx) || screenRadiusPx <= 0) {
    return minSegments;
  }
  const circumferencePx = 2 * Math.PI * screenRadiusPx;
  const segments = Math.ceil(circumferencePx / Math.max(0.5, targetEdgePx));
  return Math.min(maxSegments, Math.max(minSegments, segments));
};
