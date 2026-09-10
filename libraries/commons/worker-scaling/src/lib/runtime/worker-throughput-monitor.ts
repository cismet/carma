import {
  advanceThroughputScaling,
  createThroughputScalingState,
  getWorkerProbeLimit,
  getHeadroomConcurrency,
  relieveWorkerPressure,
  SCALING_PHASE,
} from "../core/throughput-scaling";
import {
  encodeWorkerCalibration,
  readWorkerCalibration,
} from "../core/worker-calibration";

type MonitorOptions = {
  hardwareConcurrency: number;
  storageKey: string;
  workloadVersion: string;
  onLimitChanged: () => void;
  storage?: Pick<Storage, "getItem" | "setItem">;
  now?: () => number;
  wallNow?: () => number;
  isHidden?: () => boolean;
};

/** Pool-independent instrumentation. No timer survives an empty pool. */
export const createWorkerThroughputMonitor = (options: MonitorOptions) => {
  const {
    hardwareConcurrency,
    storageKey,
    workloadVersion,
    onLimitChanged,
    storage,
    now = () => performance.now(),
    wallNow = Date.now,
    isHidden = () => typeof document !== "undefined" && document.hidden,
  } = options;
  let learned: number | undefined;
  try {
    learned = readWorkerCalibration(
      storage?.getItem(storageKey) ?? null,
      workloadVersion,
      hardwareConcurrency,
      wallNow()
    );
  } catch {
    /* Storage can be denied. */
  }
  let state = createThroughputScalingState(
    getWorkerProbeLimit(hardwareConcurrency),
    learned
  );
  if (learned !== undefined) state = { ...state, resumeAt: now() + 30_000 };
  if (isHidden()) state = relieveWorkerPressure(state, now(), true);
  let lastSaved = learned;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expectedTick = 0;
  let active = 0;
  let eligible = false;
  let windowStart = now();
  let workByKind = new Map<string, number>();
  let completedJobs = 0;
  let disposed = false;
  let epochStart = now();
  let settling = true;

  const resetWindow = () => {
    windowStart = now();
    workByKind.clear();
    completedJobs = 0;
  };
  const apply = (next: typeof state) => {
    const changed = state.concurrency !== next.concurrency;
    state = next;
    if (changed) {
      eligible = false;
      resetWindow();
      onLimitChanged();
    }
  };
  const tick = () => {
    timer = undefined;
    if (disposed || active === 0) return;
    const hidden = isHidden();
    if (hidden || now() - expectedTick > 50) {
      resetWindow();
      eligible = false;
      apply(relieveWorkerPressure(state, now(), hidden));
    }
    scheduleTick();
  };
  const scheduleTick = () => {
    if (!timer && active > 0 && !disposed) {
      expectedTick = now() + 100;
      timer = setTimeout(tick, 100);
    }
  };
  return {
    get concurrency() {
      return state.concurrency;
    },
    get state() {
      return state;
    },
    setLoad: (activeJobs: number, queuedJobs: number, warmed: boolean) => {
      if (disposed) return;
      if (activeJobs === 0 && queuedJobs === 0 && active > 0) {
        // A new burst must not finish a partly measured A/B/A trial from an
        // earlier host-load regime. Preserve only the learned optimum/hint.
        state = {
          ...state,
          phase: SCALING_PHASE.CRUISE,
          concurrency: Math.min(
            state.concurrency,
            state.validated ? getHeadroomConcurrency(state.optimum) : 2
          ),
          windows: [],
          baseline: undefined,
          probe: undefined,
          resumeAt: Math.max(state.resumeAt, now()),
        };
      }
      active = activeJobs;
      const nextEligible =
        active === state.concurrency && queuedJobs > 0 && warmed && !isHidden();
      if (!nextEligible || !eligible) resetWindow();
      if (nextEligible && !eligible) {
        epochStart = now();
        settling = true;
      }
      eligible = nextEligible;
      if (active === 0) {
        clearTimeout(timer);
        timer = undefined;
      } else scheduleTick();
    },
    complete: (
      kind: string,
      work: number,
      successful: boolean,
      startedAt: number
    ) => {
      if (disposed) return;
      if (!successful || !Number.isFinite(work) || work <= 0) {
        resetWindow();
        epochStart = now();
        settling = true;
        return;
      }
      if (
        !eligible ||
        isHidden() ||
        !Number.isFinite(startedAt) ||
        startedAt < epochStart ||
        startedAt > now()
      )
        return;
      workByKind.set(kind, (workByKind.get(kind) ?? 0) + work);
      completedJobs += 1;
      const durationMs = now() - windowStart;
      // Cover at least two pool turnovers. A fixed six-completion window can
      // alternate between one and two waves of slow, similarly sized jobs,
      // falsely reporting host-load noise and preventing downward adaptation.
      if (
        durationMs < 250 ||
        completedJobs < Math.max(6, state.concurrency * 2)
      )
        return;
      // Drop the first full window after resaturation. Carry-in jobs never
      // inflate a probe, and the remaining windows measure a steady pipeline.
      if (settling) {
        settling = false;
        resetWindow();
        return;
      }
      // In a warmed stationary stream, count completions in each interval:
      // jobs spanning adjacent windows must not be dropped at every boundary.
      // That would systematically undercount longer jobs/larger worker pools.
      const next = advanceThroughputScaling(
        state,
        {
          durationMs,
          completedJobs,
          workByKind: Object.fromEntries(workByKind),
        },
        now()
      );
      resetWindow();
      apply(next);
      if (
        next.validated &&
        next.phase === SCALING_PHASE.CRUISE &&
        lastSaved !== next.optimum
      ) {
        try {
          storage?.setItem(
            storageKey,
            encodeWorkerCalibration(
              next.optimum,
              workloadVersion,
              hardwareConcurrency,
              wallNow()
            )
          );
          lastSaved = next.optimum;
        } catch {
          /* Persistence is only a warm-start hint. */
        }
      }
    },
    capacityFailed: (available: number) => {
      if (disposed) return;
      const relieved = relieveWorkerPressure(state, now());
      apply({
        ...relieved,
        concurrency: Math.max(1, Math.min(relieved.concurrency, available)),
      });
    },
    dispose: () => {
      disposed = true;
      clearTimeout(timer);
      timer = undefined;
    },
  };
};
