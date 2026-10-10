import { TerrainMemoryDeferredError } from "../../core/terrain-memory-admission";

import type { TerrainSelectionEntry } from "../../core/terrain-selection-types";

export type TerrainStageLoadFailure = {
  value: TerrainSelectionEntry;
  error: unknown;
};

/** Keep preparation concurrent while each coverage stage publishes in order. */
export const loadRasterDemTerrainStages = async ({
  stages,
  scheduledCount,
  current,
  concurrency,
  prepareEntry,
  admitEntry,
  hasEntryReservation,
  setProgress,
  publishInBackground,
  requestPublication,
}: Readonly<{
  stages: readonly (readonly TerrainSelectionEntry[])[];
  scheduledCount: number;
  current: () => boolean;
  concurrency: () => number;
  prepareEntry: (entry: TerrainSelectionEntry) => Promise<void>;
  admitEntry?: (entry: TerrainSelectionEntry) => boolean;
  hasEntryReservation?: (entry: TerrainSelectionEntry) => boolean;
  setProgress: (fraction: number) => void;
  publishInBackground: () => void;
  requestPublication: () => Promise<void>;
}>): Promise<{
  failures: TerrainStageLoadFailure[];
  memoryDeferred: boolean;
}> => {
  const failures: TerrainStageLoadFailure[] = [];
  let completedEntries = 0;
  let memoryDeferred = false;
  let finerStagesDeferred = false;
  // Reuse ready coarse reserve coverage before asking resident fine geometry
  // to make room. This publication never waits for optional seam work.
  if (current()) await requestPublication();
  for (const stage of stages) {
    if (!current()) break;
    if (stage.length === 0) continue;
    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(Math.max(1, concurrency()), stage.length) },
      async () => {
        while (cursor < stage.length) {
          const entry = stage[cursor++];
          try {
            if (!current()) throw new Error("Stale terrain selection");
            try {
              if (
                (finerStagesDeferred && !hasEntryReservation?.(entry)) ||
                (admitEntry && !admitEntry(entry))
              ) {
                memoryDeferred = true;
                continue;
              }
              await prepareEntry(entry);
            } finally {
              // Reserve one unit for the final stitched/publication pass.
              if (current())
                setProgress(++completedEntries / (scheduledCount + 1));
            }
            if (current()) publishInBackground();
          } catch (error) {
            if (error instanceof TerrainMemoryDeferredError) {
              memoryDeferred = true;
              continue;
            }
            if (!(error instanceof Error && error.name === "AbortError"))
              failures.push({ value: entry, error });
          }
        }
      }
    );
    await Promise.all(workers);
    // Publish first coverage before finer work, yielding to input/painting.
    // This waits only for the cut, never for optional seam refinement.
    if (current()) await requestPublication();
    // A deferred stage must settle before requesting finer detail. Prepaid
    // completion siblings still drain even when they have a lower rank.
    if (memoryDeferred) finerStagesDeferred = true;
  }
  return { failures, memoryDeferred };
};
