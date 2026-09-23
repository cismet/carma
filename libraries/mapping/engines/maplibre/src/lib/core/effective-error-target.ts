import { clamp } from "@carma-commons/math";

export const ERROR_TARGET_POLICY = {
  relaxFactor: 2,
  relaxHoldMs: 1_000,
  maxRelaxMultiplier: 4,
  maxErrorTarget: 50,
  /** Base used for the relax cap when the requested target is (near) zero. */
  minimumRelaxBase: 0.125,
  tightenFactor: 2,
  tightenCooldownMs: 1_500,
  tightenHeadroomFraction: 0.8,
  growthRatioInitial: 4,
  growthRatioMinimum: 2,
  growthRatioMaximum: 8,
  growthRatioWeight: 0.5,
  failedViewZoomDelta: 0.5,
  failedViewPitchDeltaDeg: 20,
} as const;

export type ErrorTargetFailedView = Readonly<{
  zoom: number;
  pitch: number;
  ceiling: number;
}>;

export type EffectiveErrorTargetState = Readonly<{
  requested: number;
  effective: number;
  lastChangeAt: number;
  /** Start of the current full-idle-unconverged stall, if any. */
  stallSince: number | null;
  failedTarget: number | null;
  failedView: ErrorTargetFailedView | null;
  growthRatio: number;
  /** Main-view bytes before the last tighten step, until it converged. */
  tightenBaselineBytes: number | null;
}>;

export type ErrorTargetObservation = Readonly<{
  now: number;
  physicallyFull: boolean;
  pipelineIdle: boolean;
  mainConverged: boolean;
  usedBytesMain: number;
  cachedBytes: number;
  ceiling: number;
  zoom: number;
  pitch: number;
  unusedEvictable: boolean;
  /** Timestamp of the last loaded model (progress); 0 when none. */
  lastProgressAt: number;
}>;

export type EffectiveErrorTargetResult = Readonly<{
  state: EffectiveErrorTargetState;
  changed: boolean;
  /** Delay until a time-gated decision may flip without new frames. */
  retryInMs: number | null;
}>;

export const createEffectiveErrorTargetState = (
  requested: number,
  now: number
): EffectiveErrorTargetState => ({
  requested,
  effective: requested,
  lastChangeAt: now,
  stallSince: null,
  failedTarget: null,
  failedView: null,
  growthRatio: ERROR_TARGET_POLICY.growthRatioInitial,
  tightenBaselineBytes: null,
});

const resolveRelaxCap = (requested: number): number =>
  Math.min(
    ERROR_TARGET_POLICY.maxErrorTarget,
    ERROR_TARGET_POLICY.maxRelaxMultiplier *
      Math.max(requested, ERROR_TARGET_POLICY.minimumRelaxBase)
  );

const hasFailedViewExpired = (
  failedView: ErrorTargetFailedView,
  observation: ErrorTargetObservation
): boolean =>
  Math.abs(observation.zoom - failedView.zoom) >=
    ERROR_TARGET_POLICY.failedViewZoomDelta ||
  Math.abs(observation.pitch - failedView.pitch) >=
    ERROR_TARGET_POLICY.failedViewPitchDeltaDeg ||
  observation.ceiling > failedView.ceiling;

export const nextEffectiveErrorTarget = (
  state: EffectiveErrorTargetState,
  observation: ErrorTargetObservation
): EffectiveErrorTargetResult => {
  const { now } = observation;
  let next: EffectiveErrorTargetState = state;
  const assign = (patch: Partial<EffectiveErrorTargetState>) => {
    next = { ...next, ...patch };
  };

  // Failure memory only applies to the view class it was recorded in.
  if (next.failedView && hasFailedViewExpired(next.failedView, observation)) {
    assign({ failedTarget: null, failedView: null });
  }

  // Learn how much the used set grows per tighten step once it converged.
  if (
    next.tightenBaselineBytes !== null &&
    observation.pipelineIdle &&
    observation.mainConverged &&
    now > next.lastChangeAt
  ) {
    const baseline = next.tightenBaselineBytes;
    if (baseline > 0 && observation.usedBytesMain > 0) {
      const ratio = observation.usedBytesMain / baseline;
      assign({
        growthRatio: clamp(
          next.growthRatio +
            (ratio - next.growthRatio) * ERROR_TARGET_POLICY.growthRatioWeight,
          ERROR_TARGET_POLICY.growthRatioMinimum,
          ERROR_TARGET_POLICY.growthRatioMaximum
        ),
      });
    }
    assign({ tightenBaselineBytes: null });
  }

  let retryInMs: number | null = null;

  // Tighten: converged with headroom, outside the cooldown and above what
  // already failed in this view class.
  if (
    observation.pipelineIdle &&
    observation.mainConverged &&
    next.effective > next.requested
  ) {
    const candidate = Math.max(
      next.requested,
      next.effective / ERROR_TARGET_POLICY.tightenFactor
    );
    const headroomOk =
      observation.usedBytesMain * next.growthRatio <=
      ERROR_TARGET_POLICY.tightenHeadroomFraction * observation.ceiling;
    const aboveFailure =
      next.failedTarget === null || candidate > next.failedTarget;
    const cooldownRemaining =
      next.lastChangeAt + ERROR_TARGET_POLICY.tightenCooldownMs - now;
    if (headroomOk && aboveFailure) {
      if (cooldownRemaining > 0) {
        retryInMs = cooldownRemaining;
      } else {
        assign({
          effective: candidate,
          lastChangeAt: now,
          stallSince: null,
          tightenBaselineBytes: observation.usedBytesMain,
        });
        return { state: next, changed: true, retryInMs: null };
      }
    }
  }

  // Relax: physically full, idle, unconverged and nothing left to evict for
  // at least the hold time since the last progress.
  const stalled =
    observation.physicallyFull &&
    observation.pipelineIdle &&
    !observation.mainConverged &&
    !observation.unusedEvictable;
  if (observation.mainConverged) {
    if (next.stallSince !== null) assign({ stallSince: null });
  } else if (stalled) {
    const stallSince =
      next.stallSince === null
        ? now
        : Math.max(next.stallSince, observation.lastProgressAt);
    if (stallSince !== next.stallSince) assign({ stallSince });
    const cap = resolveRelaxCap(next.requested);
    const relaxed = Math.min(
      cap,
      Math.max(next.effective, ERROR_TARGET_POLICY.minimumRelaxBase) *
        ERROR_TARGET_POLICY.relaxFactor
    );
    if (relaxed > next.effective) {
      const holdRemaining = stallSince + ERROR_TARGET_POLICY.relaxHoldMs - now;
      if (holdRemaining > 0) {
        retryInMs =
          retryInMs === null
            ? holdRemaining
            : Math.min(retryInMs, holdRemaining);
      } else {
        assign({
          failedTarget: next.effective,
          failedView: {
            zoom: observation.zoom,
            pitch: observation.pitch,
            ceiling: observation.ceiling,
          },
          effective: relaxed,
          lastChangeAt: now,
          stallSince: null,
          tightenBaselineBytes: null,
        });
        return { state: next, changed: true, retryInMs: null };
      }
    }
  }

  return { state: next, changed: false, retryInMs };
};
