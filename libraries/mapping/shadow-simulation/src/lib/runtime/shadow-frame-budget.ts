import {
  SHADOW_QUALITY_PROFILES,
  DEFAULT_SHADOW_QUALITY,
  type ShadowQualityMultiplier,
} from "../core/shadow-types";
const FRAME_TIME_EPSILON_MS = 0.01;
const SAMPLE_WINDOW_MS = 500;
const RECOVERY_WINDOW_MS = 1500;

export type ShadowFrameBudget = Readonly<{
  lastFrameMs: number | null;
  sampleDurationMs: number;
  sampleCount: number;
  recoveryDurationMs: number;
  updateIntervalMs: number;
  targetFrameMs: number;
  depthScale: number;
  trial: Readonly<{
    baselineFrameMs: number;
    updateIntervalMs: number;
    depthScale: number;
  }> | null;
  adaptationBlocked: boolean;
}>;

export const createShadowFrameBudget = (
  quality: ShadowQualityMultiplier = DEFAULT_SHADOW_QUALITY
): ShadowFrameBudget => ({
  lastFrameMs: null,
  sampleDurationMs: 0,
  sampleCount: 0,
  recoveryDurationMs: 0,
  updateIntervalMs: SHADOW_QUALITY_PROFILES[quality].targetFps
    ? 1000 / SHADOW_QUALITY_PROFILES[quality].targetFps!
    : 0,
  targetFrameMs: SHADOW_QUALITY_PROFILES[quality].targetFps
    ? 1000 / SHADOW_QUALITY_PROFILES[quality].targetFps!
    : 0,
  depthScale: 1,
  trial: null,
  adaptationBlocked: false,
});

/** Measure continuous camera motion only: idle gaps are not slow frames.
 * Reduce shadow fitting cadence first, then depth-map density. Never resize
 * color targets or change terrain during motion. Ultra bypasses adaptation.
 */
export const updateShadowFrameBudget = (
  previous: ShadowFrameBudget,
  nowMs: number,
  moving: boolean
): ShadowFrameBudget => {
  if (previous.targetFrameMs === 0) return previous;
  if (!moving || !Number.isFinite(nowMs)) {
    return previous.lastFrameMs === null
      ? previous
      : {
          ...previous,
          lastFrameMs: null,
          sampleDurationMs: 0,
          sampleCount: 0,
          recoveryDurationMs: 0,
          depthScale: 1,
          trial: null,
          adaptationBlocked: false,
        };
  }
  const elapsed =
    previous.lastFrameMs === null ? 0 : nowMs - previous.lastFrameMs;
  if (elapsed <= 0) return { ...previous, lastFrameMs: nowMs };
  const duration = previous.sampleDurationMs + elapsed;
  const count = previous.sampleCount + 1;
  if (duration < SAMPLE_WINDOW_MS) {
    return {
      ...previous,
      lastFrameMs: nowMs,
      sampleDurationMs: duration,
      sampleCount: count,
    };
  }
  const averageFrameMs = duration / count;
  const targetFrameMs = previous.targetFrameMs;
  // A 120 FPS target cannot make a 60 Hz display faster. Keep a reduction
  // only if the next measurement improves throughput by at least 5%; otherwise
  // restore the previous quality and stop probing until the next gesture.
  const ineffectiveTrial =
    previous.trial && averageFrameMs >= previous.trial.baselineFrameMs * 0.95;
  if (ineffectiveTrial || previous.adaptationBlocked) {
    return {
      ...previous,
      lastFrameMs: nowMs,
      sampleDurationMs: 0,
      sampleCount: 0,
      trial: null,
      adaptationBlocked: true,
      updateIntervalMs:
        previous.trial?.updateIntervalMs ?? previous.updateIntervalMs,
      depthScale: previous.trial?.depthScale ?? previous.depthScale,
    };
  }
  const recovering = averageFrameMs < targetFrameMs / 1.2;
  const recoveryDurationMs = recovering
    ? previous.recoveryDurationMs + duration
    : 0;
  const updateIntervalMs =
    averageFrameMs > targetFrameMs + FRAME_TIME_EPSILON_MS
      ? Math.min(targetFrameMs * 4, previous.updateIntervalMs + targetFrameMs)
      : recoveryDurationMs >= RECOVERY_WINDOW_MS
      ? Math.max(targetFrameMs, previous.updateIntervalMs - targetFrameMs)
      : previous.updateIntervalMs;
  const depthScale =
    averageFrameMs > targetFrameMs + FRAME_TIME_EPSILON_MS &&
    previous.updateIntervalMs >= targetFrameMs * 4
      ? Math.max(0.5, previous.depthScale - 0.25)
      : recoveryDurationMs >= RECOVERY_WINDOW_MS
      ? Math.min(1, previous.depthScale + 0.25)
      : previous.depthScale;
  return {
    ...previous,
    lastFrameMs: nowMs,
    sampleDurationMs: 0,
    sampleCount: 0,
    recoveryDurationMs:
      recoveryDurationMs >= RECOVERY_WINDOW_MS ? 0 : recoveryDurationMs,
    updateIntervalMs,
    depthScale,
    trial:
      updateIntervalMs > previous.updateIntervalMs ||
      depthScale < previous.depthScale
        ? {
            baselineFrameMs: averageFrameMs,
            updateIntervalMs: previous.updateIntervalMs,
            depthScale: previous.depthScale,
          }
        : null,
    adaptationBlocked: false,
  };
};
