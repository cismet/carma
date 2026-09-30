import { resolveTileContentUrl } from "./three-tiles-runtime-vendor";
import type { RuntimeTile } from "./three-tiles-runtime-types";
import type {
  MeshTileWaitReason,
  MeshTileWaitRole,
} from "../../core/mesh-tile-wait";
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
  role: MeshTileWaitRole,
  reason: MeshTileWaitReason | null,
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

/** Optional console snapshot; never imported by ordinary frame processing. */
export function reportThreeTilesFrameTelemetry(
  runtimeState: import("./three-tiles-runtime-frame-types").ThreeTilesFrameRuntimeState,
  dependencies: Pick<
    import("./three-tiles-runtime-services").ThreeTilesRuntimeServices,
    "getTileDebugProgress" | "isTileInMainView" | "drainTileWaitEvents"
  >,
  hooks: import("./three-tiles-runtime-frame-types").ThreeTilesFrameHooks
) {
  if (!runtimeState.options.diagnostics || !runtimeState.tiles) return;
  const {
    frameState,
    attachment,
    localTelemetry,
    telemetryCenter,
    telemetrySphere,
  } = hooks;
  if (
    (runtimeState.options.tileTelemetry === true ||
      (localTelemetry && runtimeState.tileBoundsVisible)) &&
    runtimeState.options.tileTelemetry !== false &&
    performance.now() - runtimeState.lastRuntimeDebugAt >= 1_000
  ) {
    runtimeState.lastRuntimeDebugAt = performance.now();
    const tileEvents = [...frameState.telemetryTiles].map((tile) => {
      const progress = dependencies.getTileDebugProgress(tile);
      const inView = dependencies.isTileInMainView(tile as RuntimeTile);
      const bounds = (tile as RuntimeTile).engineData?.boundingVolume;
      if (bounds) {
        bounds.getSphere(telemetrySphere);
        telemetryCenter
          .copy(telemetrySphere.center)
          .applyMatrix4(runtimeState.tileViewProjection);
      }
      return {
        url: resolveTileContentUrl(tile),
        inView,
        shadowOnly:
          !inView && (tile as RuntimeTile).shadowReceiverCurrent === true,
        externalTileset: tile.internal.hasUnrenderableContent,
        loadingState: tile.internal.loadingState,
        lodDepth: tile.internal.depth,
        geometricError: tile.geometricError,
        screenErrorPixels: tile.traversal.error,
        cameraDistance: tile.traversal.distanceFromCamera,
        screenCenterDistanceNdc: bounds
          ? Math.hypot(telemetryCenter.x, telemetryCenter.y)
          : null,
        ...progress,
        steps: getThreeTileDiagnosticSteps(
          progress,
          runtimeState.shadowView !== null,
          performance.now()
        ),
      };
    });
    frameState.telemetryTiles.clear();
    console.debug(
      "[tiles3d-debug] runtime state",
      JSON.stringify({
        frameCount: runtimeState.tiles.frameCount,
        visible: runtimeState.tiles.visibleTiles.size,
        active: runtimeState.tiles.activeTiles.size,
        groupChildren: runtimeState.tiles.group.children.length,
        queued: runtimeState.tiles.stats.queued,
        downloading: runtimeState.tiles.stats.downloading,
        parsing: runtimeState.tiles.stats.parsing,
        ...attachment.getQueueTelemetry(),
        viewportCut: runtimeState.lastLoadedViewportCutSize,
        retainedViewport: runtimeState.displayedMeshFrontier.size,
        corridorTiles: runtimeState.committedMeshCasterFrontier.size,
        shadowSelectionEnabled: runtimeState.shadowSelectionEnabled,
        receiverCount: runtimeState.shadowReceiverMask?.sourceCount ?? 0,
        tileEvents,
        tileWaitEvents: dependencies.drainTileWaitEvents(),
        telemetryDropped: frameState.telemetryDropped,
        requestConcurrency: runtimeState.tiles.downloadQueue.maxJobsPerOrigin,
        perOriginConcurrency: runtimeState.tiles.downloadQueue.maxJobsPerOrigin,
        memoryAdmissionPaused: runtimeState.memoryAdmissionPaused,
        effectiveErrorTarget: runtimeState.effectiveErrorTarget,
        requestedErrorTarget: runtimeState.requestedErrorTarget,
        mainViewConverged: runtimeState.lastMainViewConverged,
      })
    );
    frameState.telemetryDropped = 0;
  }
}
