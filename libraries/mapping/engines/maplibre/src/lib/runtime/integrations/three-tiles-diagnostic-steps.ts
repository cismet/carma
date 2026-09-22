import type {
  MeshTileDebugProgress,
  MeshTileWait,
} from "./three-tiles-runtime-types";
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
  // Offscreen casters never receive a primary colour draw. Their observed
  // depth submission ends publication waiting too; residency alone does not.
  const submitted = shadow
    ? Math.min(
        progress.visibleAt ?? Infinity,
        progress.shadowDepthSubmittedAt ?? Infinity
      )
    : progress.visibleAt;
  const firstSubmission =
    submitted !== undefined && Number.isFinite(submitted)
      ? submitted
      : undefined;
  if (prepared > 0) add("Anzeige", prepared, firstSubmission);
  if (shadow) add("Schatten", firstSubmission, progress.shadowPresentedAt);
  return steps;
};

/** Observe transitions only; never feed diagnostic clocks back into admission. */
export const recordThreeTileWait = (
  progress: MeshTileDebugProgress,
  role: MeshTileWait["role"],
  reason: MeshTileWait["reason"] | null,
  now: number,
  blocker?: string
): boolean => {
  const waits = (progress.waits ??= []);
  const active = waits.find(
    (wait) => wait.role === role && wait.until === undefined
  );
  if (active?.reason === reason && active?.blocker === blocker) return false;
  if (!active && reason === null) return false;
  if (active) active.until = Math.max(active.since, now);
  if (reason !== null)
    waits.push({ role, reason, since: now, ...(blocker ? { blocker } : {}) });
  while (waits.length > 32) {
    const closed = waits.findIndex((wait) => wait.until !== undefined);
    if (closed < 0) break;
    waits.splice(closed, 1);
  }
  return true;
};
