import { clamp, lerp } from "@carma-commons/math";

export const MAP_LOADING_PHASE = {
  CONTENT: "content",
  TERRAIN: "terrain",
  SHADOW: "shadow",
} as const;

export type MapLoadingPhase =
  (typeof MAP_LOADING_PHASE)[keyof typeof MAP_LOADING_PHASE];
export type MapLoadingDurations = Readonly<Record<MapLoadingPhase, number>>;
// Cold-start priors, not promises or measured byte counts. Completed local
// cycles replace these with an EWMA; keep weights fixed within each cycle.
export const DEFAULT_MAP_LOADING_DURATIONS: MapLoadingDurations = {
  [MAP_LOADING_PHASE.CONTENT]: 600,
  [MAP_LOADING_PHASE.TERRAIN]: 1800,
  [MAP_LOADING_PHASE.SHADOW]: 1200,
};
export const updateMapLoadingDuration = (previous: number, elapsedMs: number) =>
  Number.isFinite(elapsedMs) && elapsedMs > 0
    ? lerp(previous, clamp(elapsedMs, 50, 60_000), 0.25)
    : previous;
export type MapLoadingWork = Readonly<{
  phase: MapLoadingPhase;
  id: string;
  fraction: number;
}>;
export type MapLoadingProgress = Readonly<{
  active: boolean;
  percent: number;
  phases: readonly MapLoadingPhase[];
}>;

export const EMPTY_MAP_LOADING_PROGRESS: MapLoadingProgress = {
  active: false,
  percent: 100,
  phases: [],
};

export const updateMapLoadingWork = (
  previous: readonly MapLoadingWork[],
  update: MapLoadingWork
): readonly MapLoadingWork[] => {
  const fraction = Number.isFinite(update.fraction)
    ? clamp(update.fraction, 0, 1)
    : 0;
  const existing = previous.find(
    ({ phase, id }) => phase === update.phase && id === update.id
  );
  if (existing?.fraction === fraction || (!existing && fraction === 1))
    return previous;
  // Finished participants retain their share until the entire cycle finishes.
  // A later shadow-only refresh must not inherit old terrain/content weights.
  const work = previous.some((task) => task.fraction < 1) ? previous : [];
  return [
    ...work.filter(
      ({ phase, id }) => phase !== update.phase || id !== update.id
    ),
    { ...update, fraction },
  ];
};

export const getCombinedMapLoadingProgress = (
  work: readonly MapLoadingWork[],
  durations: MapLoadingDurations = DEFAULT_MAP_LOADING_DURATIONS
): MapLoadingProgress => {
  if (!work.length) return EMPTY_MAP_LOADING_PROGRESS;
  const phases = Object.values(MAP_LOADING_PHASE).filter((phase) =>
    work.some((task) => task.phase === phase)
  );
  const fraction =
    phases.reduce((sum, phase) => {
      const tasks = work.filter((task) => task.phase === phase);
      return (
        sum +
        (tasks.reduce((value, task) => value + task.fraction, 0) /
          tasks.length) *
          durations[phase]
      );
    }, 0) / phases.reduce((sum, phase) => sum + durations[phase], 0);
  const active = work.some((task) => task.fraction < 1);
  return {
    active,
    percent: active ? Math.min(99, Math.round(fraction * 100)) : 100,
    phases,
  };
};
