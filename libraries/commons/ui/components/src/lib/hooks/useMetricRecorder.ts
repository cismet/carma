import { useSyncExternalStore } from "react";

/** One named time series the recorder keeps, with how to show it. */
export type MetricSeriesSpec = {
  id: string;
  label: string;
  unit?: string;
  /** Fixed lower bound of the sparkline; omitted autoscales to the samples. */
  min?: number;
  /** Fixed upper bound of the sparkline; omitted autoscales to the samples. */
  max?: number;
  /** Formats the current value; default one decimal at most. */
  format?: (value: number) => string;
};

export type MetricLogEntry = {
  /** Milliseconds since the recorder started. */
  at: number;
  message: string;
};

export type MetricRecorder = {
  /** Append one sample per series; a series absent from `values` repeats its last value. */
  sample: (values: Record<string, number>) => void;
  /** Append one line to the update log. */
  log: (message: string) => void;
  /** Samples of one series, oldest first, at most `capacity` long. */
  series: (id: string) => readonly number[];
  /** Current (last sampled) value of one series, or NaN. */
  current: (id: string) => number;
  /** Log lines, oldest first, at most `logCapacity` long. */
  entries: () => readonly MetricLogEntry[];
  /** Milliseconds since the recorder started. */
  elapsed: () => number;
  subscribe: (listener: () => void) => () => void;
  /** Monotonic change counter for useSyncExternalStore. */
  version: () => number;
  clear: () => void;
};

/**
 * Scrolling metric history and update log shared by diagnostics panels:
 * fixed capacity per series, one change counter, no allocations per sample
 * beyond the ring slice.
 */
export const createMetricRecorder = (options?: {
  capacity?: number;
  logCapacity?: number;
}): MetricRecorder => {
  const capacity = options?.capacity ?? 120;
  const logCapacity = options?.logCapacity ?? 200;
  const startedAt =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const now = () =>
    (typeof performance !== "undefined" ? performance.now() : Date.now()) -
    startedAt;
  const histories = new Map<string, number[]>();
  const currents = new Map<string, number>();
  let entries: MetricLogEntry[] = [];
  let version = 0;
  const listeners = new Set<() => void>();
  const notify = () => {
    version += 1;
    for (const listener of listeners) listener();
  };
  return {
    sample(values) {
      for (const [id, value] of Object.entries(values)) currents.set(id, value);
      for (const [id, value] of currents) {
        let history = histories.get(id);
        if (!history) {
          history = [];
          histories.set(id, history);
        }
        history.push(value);
        if (history.length > capacity)
          history.splice(0, history.length - capacity);
      }
      notify();
    },
    log(message) {
      entries = [...entries, { at: now(), message }];
      if (entries.length > logCapacity)
        entries = entries.slice(entries.length - logCapacity);
      notify();
    },
    series: (id) => [...(histories.get(id) ?? [])],
    current: (id) => currents.get(id) ?? Number.NaN,
    entries: () => entries,
    elapsed: now,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    version: () => version,
    clear() {
      histories.clear();
      currents.clear();
      entries = [];
      notify();
    },
  };
};

/** Re-renders the caller whenever the recorder changes. */
export const useMetricRecorder = (recorder: MetricRecorder): number =>
  useSyncExternalStore(recorder.subscribe, recorder.version, recorder.version);
