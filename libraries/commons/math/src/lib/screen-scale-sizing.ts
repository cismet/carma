// Screen-targeted world sizing with hysteresis stepping (scale-bar rule).
//
// Pure, engine-agnostic helpers for a *known-scale reference object*: a
// world-anchored shape (disc, ring, marker) that holds a recognisable size you
// can read a real measure off, rather than a constant-pixel handle. The model
// is borrowed from map scale bars / graticules: pick a round real-world length
// and only step it on a meaningful zoom change. The 1-2-5 series is the classic
// "nice numbers" choice (Heckbert, Graphics Gems, 1990; also D3 ticks).
//
// These are deliberately not tied to any specific renderer (Cesium gizmo,
// point-query disc, …) — callers map them onto their own world units. (#4078)

const NICE_STEP_MANTISSAS = [1, 2, 5, 10] as const;

// Snap a positive value to the nearest entry of the 1-2-5 decade series
// (…, 0.5, 1, 2, 5, 10, 20, 50, …) so a size reads as a recognisable round
// number and jumps between steps instead of breathing.
export const snapToNiceStep = (value: number): number => {
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

export type ResolveWorldSizeForScreenTargetInput = {
  // Desired on-screen size in pixels.
  targetScreenPx: number;
  // Projected pixels per world unit at the anchor.
  pixelPerWorld: number;
  // Snap the result to the 1-2-5 series when true.
  quantize: boolean;
};

// World size that renders at ~targetScreenPx for the given projection scale,
// optionally quantized to the 1-2-5 series.
export const resolveWorldSizeForScreenTarget = ({
  targetScreenPx,
  pixelPerWorld,
  quantize,
}: ResolveWorldSizeForScreenTargetInput): number => {
  if (!Number.isFinite(pixelPerWorld) || pixelPerWorld <= 0) {
    return targetScreenPx > 0 ? targetScreenPx : 0;
  }
  const continuousSize = targetScreenPx / pixelPerWorld;
  return quantize ? snapToNiceStep(continuousSize) : continuousSize;
};

// Factor by which the on-screen resolution must change before the held size
// moves to the next step. 2 → it only re-steps once the camera has zoomed in or
// out far enough to double or halve the pixels-per-world.
export const SCREEN_SCALE_STEP_FACTOR = 2;

// Whether a held world size should re-evaluate its step. The size is fixed until
// the projection scale doubles or halves (× `factor`) relative to when the
// current step was set — hysteresis that keeps it stable during normal
// panning/orbiting and only jumps on a meaningful zoom change.
export const shouldRestepScreenScale = (
  referenceScale: number,
  currentScale: number,
  factor: number = SCREEN_SCALE_STEP_FACTOR
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

export type SteppedScreenScaleInput = {
  // Projected pixels per world unit at the anchor this frame. A non-finite or
  // <= 0 value means "unmeasurable" (e.g. anchor behind the camera).
  currentScale: number;
  // Desired on-screen size in pixels.
  targetScreenPx: number;
  // World size to return while the scale is unmeasurable and no step is held yet.
  fallback: number;
  // Hysteresis band factor (see SCREEN_SCALE_STEP_FACTOR).
  stepFactor?: number;
  // Snap each step to the 1-2-5 series when true.
  quantize?: boolean;
  // Floor for the stepped world size.
  minWorldSize?: number;
};

export type SteppedScreenScaler = {
  // World size for the current frame: holds the last step until the projection
  // scale crosses the hysteresis band, then re-steps to the screen-targeted size.
  resolve: (input: SteppedScreenScaleInput) => number;
  // Forget the held step so the next resolve re-captures (e.g. new selection).
  reset: () => void;
};

// Stateful scale-bar stepper: owns only the held world size and the scale at
// which it was set, so it suits both a hook (via a ref) and a plain controller
// (via a closure). All sizing parameters are passed per-call so they may vary
// per frame.
export const createSteppedScreenScaler = (): SteppedScreenScaler => {
  let steppedWorldSize: number | null = null;
  let referenceScale: number | null = null;
  return {
    resolve: ({
      currentScale,
      targetScreenPx,
      fallback,
      stepFactor = SCREEN_SCALE_STEP_FACTOR,
      quantize = false,
      minWorldSize = 0,
    }) => {
      if (!Number.isFinite(currentScale) || currentScale <= 0) {
        return steppedWorldSize ?? fallback;
      }
      if (
        steppedWorldSize === null ||
        shouldRestepScreenScale(referenceScale ?? 0, currentScale, stepFactor)
      ) {
        steppedWorldSize = Math.max(
          resolveWorldSizeForScreenTarget({
            targetScreenPx,
            pixelPerWorld: currentScale,
            quantize,
          }),
          minWorldSize
        );
        referenceScale = currentScale;
      }
      return steppedWorldSize;
    },
    reset: () => {
      steppedWorldSize = null;
      referenceScale = null;
    },
  };
};

export type CircleSegmentOptions = {
  // Smallest segment count, so even tiny circles stay smooth.
  minSegments?: number;
  // Upper bound, to cap geometry/DOM work for very large circles.
  maxSegments?: number;
  // Desired on-screen length of one polygon edge, in pixels.
  targetEdgePx?: number;
};

const DEFAULT_CIRCLE_SEGMENT_OPTIONS: Required<CircleSegmentOptions> = {
  minSegments: 48,
  maxSegments: 256,
  targetEdgePx: 2.5,
};

// Segment count for a circle/ring so its polygon edges read as a smooth curve.
// Scales with the on-screen radius: the larger it appears, the more segments are
// needed to keep each edge near `targetEdgePx`. Clamped so small circles are not
// under-tessellated and huge ones do not explode geometry cost.
export const computeCircleSegments = (
  screenRadiusPx: number,
  options: CircleSegmentOptions = {}
): number => {
  const { minSegments, maxSegments, targetEdgePx } = {
    ...DEFAULT_CIRCLE_SEGMENT_OPTIONS,
    ...options,
  };
  if (!Number.isFinite(screenRadiusPx) || screenRadiusPx <= 0) {
    return minSegments;
  }
  const circumferencePx = 2 * Math.PI * screenRadiusPx;
  const segments = Math.ceil(circumferencePx / Math.max(0.5, targetEdgePx));
  return Math.min(maxSegments, Math.max(minSegments, segments));
};
