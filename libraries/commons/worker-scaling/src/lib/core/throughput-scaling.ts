export const SCALING_PHASE = {
  BASELINE: "baseline",
  PROBE: "probe",
  VERIFY: "verify",
  CRUISE: "cruise",
} as const;

export type ThroughputWindow = Readonly<{
  durationMs: number;
  completedJobs: number;
  workByKind: Readonly<Record<string, number>>;
}>;

type Measurement = Readonly<{
  throughput: number;
  mix: Readonly<Record<string, number>>;
}>;

export type ThroughputScalingState = Readonly<{
  phase: (typeof SCALING_PHASE)[keyof typeof SCALING_PHASE];
  maximum: number;
  concurrency: number;
  optimum: number;
  direction: 1 | -1;
  windows: readonly Measurement[];
  baseline?: Measurement;
  probe?: Measurement;
  resumeAt: number;
  validated: boolean;
}>;

// One hardware thread remains outside even the short probes. The hard ceiling
// also bounds worker-local WASM heaps, decoded raster copies and module graphs.
export const getWorkerProbeLimit = (hardwareConcurrency: number): number =>
  Number.isFinite(hardwareConcurrency)
    ? Math.max(1, Math.min(8, Math.floor(hardwareConcurrency) - 1))
    : 2;

export const getHeadroomConcurrency = (optimum: number): number =>
  Math.max(1, Math.floor(optimum * 0.8));

export const createThroughputScalingState = (
  maximum: number,
  learnedOptimum?: number
): ThroughputScalingState => {
  const bound = Math.max(1, Math.min(8, Math.floor(maximum) || 1));
  const optimum = Math.max(1, Math.min(bound, Math.floor(learnedOptimum ?? 2)));
  return {
    phase:
      learnedOptimum === undefined
        ? SCALING_PHASE.BASELINE
        : SCALING_PHASE.CRUISE,
    maximum: bound,
    concurrency:
      learnedOptimum === undefined ? optimum : getHeadroomConcurrency(optimum),
    optimum,
    direction: 1,
    windows: [],
    resumeAt: 0,
    validated: learnedOptimum !== undefined,
  };
};

const similarMix = (a: Measurement, b: Measurement): boolean => {
  const kinds = new Set([...Object.keys(a.mix), ...Object.keys(b.mix)]);
  return (
    [...kinds].reduce(
      (sum, kind) => sum + Math.abs((a.mix[kind] ?? 0) - (b.mix[kind] ?? 0)),
      0
    ) <= 0.2
  );
};

const cruise = (
  state: ThroughputScalingState,
  now: number
): ThroughputScalingState => ({
  ...state,
  phase: SCALING_PHASE.CRUISE,
  concurrency: getHeadroomConcurrency(state.optimum),
  windows: [],
  baseline: undefined,
  probe: undefined,
  resumeAt: now + 30_000,
});

export const relieveWorkerPressure = (
  state: ThroughputScalingState,
  now: number,
  hidden = false
): ThroughputScalingState => ({
  ...cruise(state, now),
  concurrency: hidden
    ? 1
    : Math.max(
        1,
        Math.min(getHeadroomConcurrency(state.optimum), state.concurrency - 1)
      ),
  // Never persist transient contention as the machine's learned optimum.
  resumeAt: now + 30_000,
});

/** Saturated, warmed, same-mix A/B/A trials compare total work / wall second,
 * not per-worker latency. Three windows reduce one-off completion noise. */
export const advanceThroughputScaling = (
  state: ThroughputScalingState,
  window: ThroughputWindow,
  now: number
): ThroughputScalingState => {
  const values = Object.values(window.workByKind);
  const work = values.reduce((sum, value) => sum + value, 0);
  if (
    !Number.isFinite(window.durationMs) ||
    window.durationMs < 250 ||
    window.completedJobs < 6 ||
    !Number.isFinite(work) ||
    work <= 0 ||
    values.some((value) => !Number.isFinite(value) || value < 0)
  )
    return state;
  if (state.maximum === 1) return cruise(state, now);
  if (state.phase === SCALING_PHASE.CRUISE) {
    if (now < state.resumeAt) return state;
    // Revisit both neighbours periodically: other tabs/apps may have changed load.
    return {
      ...state,
      phase: SCALING_PHASE.BASELINE,
      concurrency: state.optimum,
      direction: 1,
      windows: [],
    };
  }
  const measurement: Measurement = {
    throughput: (work * 1000) / window.durationMs,
    mix: Object.fromEntries(
      Object.entries(window.workByKind).map(([kind, units]) => [
        kind,
        units / work,
      ])
    ),
  };
  const first = state.windows[0];
  const windows =
    first && !similarMix(first, measurement)
      ? [measurement]
      : [...state.windows, measurement];
  if (windows.length < 3) return { ...state, windows };
  const ordered = [...windows].sort((a, b) => a.throughput - b.throughput);
  const measured = ordered[1]!;
  if (ordered[2]!.throughput > ordered[0]!.throughput * 1.2) {
    // A noisy host is not evidence that another worker helps.
    return cruise(state, now);
  }
  if (state.phase === SCALING_PHASE.BASELINE) {
    const direction = state.optimum < state.maximum ? state.direction : -1;
    const candidate = state.optimum + direction;
    if (candidate < 1 || candidate > state.maximum) return cruise(state, now);
    return {
      ...state,
      phase: SCALING_PHASE.PROBE,
      concurrency: candidate,
      direction,
      baseline: measured,
      windows: [],
    };
  }
  if (state.phase === SCALING_PHASE.PROBE) {
    return {
      ...state,
      phase: SCALING_PHASE.VERIFY,
      concurrency: state.optimum,
      probe: measured,
      windows: [],
    };
  }
  const { baseline, probe } = state;
  if (
    !baseline ||
    !probe ||
    !similarMix(baseline, probe) ||
    !similarMix(baseline, measured) ||
    Math.abs(measured.throughput / baseline.throughput - 1) > 0.2
  ) {
    return cruise(state, now);
  }
  const reference = (baseline.throughput + measured.throughput) / 2;
  const evaluated = { ...state, validated: true };
  // Demand a repeatable absolute throughput gain; a near-tie favours fewer workers.
  const accepted =
    probe.throughput >= reference * (state.direction === 1 ? 1.05 : 0.98);
  const optimum = accepted ? state.optimum + state.direction : state.optimum;
  if (accepted) {
    if ((optimum === state.maximum && state.direction === 1) || optimum === 1)
      return cruise({ ...evaluated, optimum }, now);
    return {
      ...evaluated,
      optimum,
      concurrency: optimum,
      phase: SCALING_PHASE.BASELINE,
      windows: [],
      baseline: undefined,
      probe: undefined,
    };
  }
  if (state.direction === 1 && optimum > 1) {
    return {
      ...evaluated,
      direction: -1,
      concurrency: optimum,
      phase: SCALING_PHASE.BASELINE,
      windows: [],
      baseline: undefined,
      probe: undefined,
    };
  }
  return cruise({ ...evaluated, optimum }, now);
};
