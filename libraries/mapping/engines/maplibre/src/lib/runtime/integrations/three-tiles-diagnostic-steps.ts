import type { MeshTileDebugProgress } from "./three-tiles-runtime-types";
import type { SharedThreeSceneTileVolume } from "../../core/shared-three-scene-types";

/** Non-overlapping elapsed phases; presentation is observed, never inferred from selection. */
export const getThreeTileDiagnosticSteps = (
  progress: MeshTileDebugProgress,
  shadow: boolean,
  now: number
): NonNullable<SharedThreeSceneTileVolume["steps"]> => {
  const steps: Array<{ label: string; ms: number; pending?: boolean }> = [];
  const add = (
    label: string,
    start: number | undefined,
    end: number | undefined
  ) => {
    if (start === undefined) return;
    const ms = Math.max(0, (end ?? now) - start);
    if (ms > 0)
      steps.push({
        label,
        ms,
        ...(end === undefined ? { pending: true } : {}),
      });
  };
  add("Warten", progress.queuedAt, progress.downloadStartedAt);
  add("Laden", progress.downloadStartedAt, progress.downloadFinishedAt);
  add("Warten", progress.downloadFinishedAt, progress.parseStartedAt);
  add(
    "Dekodieren",
    progress.parseStartedAt,
    progress.publicationStartedAt ?? progress.parseFinishedAt
  );
  add("Aufbau", progress.publicationStartedAt, progress.publicationFinishedAt);
  const prepared = Math.max(
    progress.parseFinishedAt ?? 0,
    progress.publicationFinishedAt ?? 0,
    progress.loadedAt ?? 0
  );
  if (prepared > 0) add("Anzeige", prepared, progress.visibleAt);
  if (shadow) add("Schatten", progress.visibleAt, progress.shadowPresentedAt);
  return steps;
};
