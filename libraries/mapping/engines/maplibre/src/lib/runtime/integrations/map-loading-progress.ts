import type { Map as MaplibreMap } from "maplibre-gl";
import {
  EMPTY_MAP_LOADING_PROGRESS,
  DEFAULT_MAP_LOADING_DURATIONS,
  getCombinedMapLoadingProgress,
  updateMapLoadingWork,
  updateMapLoadingDuration,
  type MapLoadingDurations,
  type MapLoadingProgress,
  type MapLoadingWork,
  type MapLoadingPhase,
} from "../../core/map-loading-progress";

type Entry = {
  work: readonly MapLoadingWork[];
  snapshot: MapLoadingProgress;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setTimeout> | null;
  durations: MapLoadingDurations;
  cycleDurations: MapLoadingDurations;
  started: Map<MapLoadingPhase, number>;
};
const entries = new WeakMap<MaplibreMap, Entry>();
const getEntry = (map: MaplibreMap): Entry => {
  let entry = entries.get(map);
  if (!entry) {
    entry = {
      work: [],
      snapshot: EMPTY_MAP_LOADING_PROGRESS,
      listeners: new Set(),
      timer: null,
      durations: DEFAULT_MAP_LOADING_DURATIONS,
      cycleDurations: DEFAULT_MAP_LOADING_DURATIONS,
      started: new Map(),
    };
    entries.set(map, entry);
  }
  return entry;
};

export const publishMapLoadingProgress = (
  map: MaplibreMap,
  phase: MapLoadingPhase,
  id: string,
  fraction: number,
  recordDuration = true
) => {
  const entry = getEntry(map);
  const work = updateMapLoadingWork(entry.work, { phase, id, fraction });
  if (work === entry.work) return;
  if (!entry.snapshot.active) entry.cycleDurations = entry.durations;
  const pending = work.some(
    (task) => task.phase === phase && task.fraction < 1
  );
  if (pending && !entry.started.has(phase))
    entry.started.set(phase, performance.now());
  if (!pending && entry.started.has(phase)) {
    if (recordDuration)
      entry.durations = {
        ...entry.durations,
        [phase]: updateMapLoadingDuration(
          entry.durations[phase],
          performance.now() - entry.started.get(phase)!
        ),
      };
    entry.started.delete(phase);
  }
  entry.work = work;
  const next = getCombinedMapLoadingProgress(work, entry.cycleDurations);
  const previous = entry.snapshot;
  if (
    previous.active === next.active &&
    previous.percent === next.percent &&
    previous.phases.join() === next.phases.join()
  )
    return;
  entry.snapshot = next;
  // No React/store updates at render frequency, and no timer without a UI reader.
  if (!entry.listeners.size || entry.timer !== null) return;
  entry.timer = setTimeout(() => {
    entry.timer = null;
    for (const listener of entry.listeners) listener();
  }, 100);
};

export const getMapLoadingProgress = (map: MaplibreMap | null) =>
  (map && entries.get(map)?.snapshot) ?? EMPTY_MAP_LOADING_PROGRESS;

export const subscribeMapLoadingProgress = (
  map: MaplibreMap,
  listener: () => void
) => {
  const entry = getEntry(map);
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
    if (!entry.listeners.size && entry.timer !== null) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }
  };
};
