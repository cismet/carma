// Engine-agnostic sizing for world-anchored reference objects.

export const REFERENCE_OBJECT_SCALING_MODES = {
  SCREEN: "screen",
  WORLD: "world",
} as const;

export type ReferenceObjectScalingMode =
  (typeof REFERENCE_OBJECT_SCALING_MODES)[keyof typeof REFERENCE_OBJECT_SCALING_MODES];

const NICE_STEP_MANTISSAS = [1, 2, 5, 10] as const;

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
  targetScreenPx: number;
  pixelPerWorld: number;
  quantize: boolean;
};

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

export const SCREEN_SCALE_STEP_FACTOR = 2;

export const shouldRestepScreenScale = (
  referenceScale: number,
  currentScale: number,
  factor: number = SCREEN_SCALE_STEP_FACTOR
): boolean => {
  if (!Number.isFinite(referenceScale) || referenceScale <= 0) {
    return true;
  }
  if (!Number.isFinite(currentScale) || currentScale <= 0) {
    return false;
  }
  const ratio = currentScale / referenceScale;
  return ratio >= factor || ratio <= 1 / factor;
};

export type SteppedScreenScaleInput = {
  currentScale: number;
  targetScreenPx: number;
  fallback: number;
  stepFactor?: number;
  quantize?: boolean;
  minWorldSize?: number;
};

export type SteppedScreenScaler = {
  resolve: (input: SteppedScreenScaleInput) => number;
  reset: () => void;
};

// Holds a quantized world size until the projection scale crosses the
// hysteresis band.
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
  minSegments?: number;
  maxSegments?: number;
  targetEdgePx?: number;
};

const DEFAULT_CIRCLE_SEGMENT_OPTIONS: Required<CircleSegmentOptions> = {
  minSegments: 48,
  maxSegments: 256,
  targetEdgePx: 2.5,
};

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
