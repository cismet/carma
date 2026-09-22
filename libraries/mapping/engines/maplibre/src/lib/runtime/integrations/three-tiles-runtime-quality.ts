import { clamp } from "@carma-commons/math";
import { resolveMeshStageTarget } from "../../core/tile-scheduling-policy";
import {
  createEffectiveErrorTargetState,
  initialMeshLoadError,
  nextEffectiveErrorTarget,
  nextMemoryErrorTarget,
} from "./three-tiles-load-policy";
import { getReadyMeshRegionCut } from "./three-tiles-mesh-frontier";
import {
  TILES_ERROR_TARGET_MAX_PIXELS,
  TILES_ERROR_TARGET_MIN_PIXELS,
  VIEW_QUALITY_AUDIT_PASSES,
} from "./three-tiles-runtime-config";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import type { RuntimeTile } from "./three-tiles-runtime-types";
import { readMapView } from "./three-tiles-runtime-vendor";

/** Owns quality effects; policy inputs remain explicit and current. */
export function createThreeTilesQuality(
  runtimeState: Pick<
    ThreeTilesRuntimeState,
    | "appliedTilesetMinResolutionPx"
    | "ceilingBytes"
    | "configuredErrorTarget"
    | "displayedMeshFrontier"
    | "effectiveErrorTarget"
    | "errorTargetOverride"
    | "errorTargetState"
    | "errorTargetTimer"
    | "extentFloorArmed"
    | "extentFloorAuditPending"
    | "extentFloorPending"
    | "extentGeometricError"
    | "lastMainViewConverged"
    | "lastProgressAt"
    | "map"
    | "memoryAdmissionPaused"
    | "memoryErrorTarget"
    | "memoryErrorTargetChangedAt"
    | "meshBaseCoverageReady"
    | "meshDemandSweepPending"
    | "meshInitialBasePassDone"
    | "meshInitialHandoverDone"
    | "meshInitialReserveSettled"
    | "options"
    | "requestedErrorTarget"
    | "shadowView"
    | "tiles"
    | "tileCameraDemand"
    | "usedBytesMain"
    | "viewQualityAuditPasses"
  >,
  dependencies: Pick<
    ThreeTilesRuntimeServices,
    | "applyPendingShadowView"
    | "clearErrorTargetTimer"
    | "getRuntimeCache"
    | "getTileScreenError"
    | "initialEffectiveErrorTarget"
    | "isPipelineIdle"
    | "isTileInMainView"
    | "getTileObserverDemand"
    | "requestRender"
    | "requestShadowSelectionRefresh"
    | "resetDeferredTiles"
  >
) {
  const applyEffectiveErrorTarget: ThreeTilesRuntimeServices["applyEffectiveErrorTarget"] =
    (nextTarget: number) => {
      if (runtimeState.effectiveErrorTarget === nextTarget) return;
      runtimeState.effectiveErrorTarget = nextTarget;
      if (runtimeState.tiles)
        runtimeState.tiles.errorTarget = runtimeState.effectiveErrorTarget;
      // Decision: CURRENT-VIEW-DEMAND-20260913 in TILES_COVERAGE.md. Deferral
      // belongs to the old target, not to the tile's reusable payload.
      dependencies.resetDeferredTiles();
      runtimeState.meshDemandSweepPending = true;
      dependencies.requestShadowSelectionRefresh();
      runtimeState.tiles?.dispatchEvent({ type: "needs-update" });
      dependencies.requestRender();
    };

  const resetEffectiveErrorTarget: ThreeTilesRuntimeServices["resetEffectiveErrorTarget"] =
    () => {
      dependencies.clearErrorTargetTimer();
      runtimeState.effectiveErrorTarget =
        dependencies.initialEffectiveErrorTarget();
      runtimeState.errorTargetState = {
        ...createEffectiveErrorTargetState(
          runtimeState.requestedErrorTarget,
          Date.now()
        ),
        effective: runtimeState.effectiveErrorTarget,
      };
      if (runtimeState.tiles)
        runtimeState.tiles.errorTarget = runtimeState.effectiveErrorTarget;
    };

  const applyErrorTargetPolicy: ThreeTilesRuntimeServices["applyErrorTargetPolicy"] =
    () => {
      const cache = dependencies.getRuntimeCache();
      if (!runtimeState.tiles || !cache) return;
      // Fill base coverage first, then let independent complete families reach
      // the requested target. Global 8/4/2px barriers delayed ready corridors.
      if (runtimeState.options.providesTerrain) {
        // Skip strategy: while the camera moves, stay at the base target so
        // the bounded motion pipeline fetches coverage for newly exposed
        // ground, not refinements that would queue up behind it and delay
        // the ring tiles' promotion at moveend; refinement resumes at rest.
        const movingSkipStrategy =
          runtimeState.tiles.loadAncestors === false &&
          runtimeState.map?.isMoving?.() === true;
        // Memory-adaptive target (TILES_COVERAGE.md, R6): at the ceiling with an
        // unconverged view the target rises by half, up to the root error;
        // with room to spare it steps back towards the requested target.
        const base = initialMeshLoadError(
          runtimeState.requestedErrorTarget,
          runtimeState.options.baseErrorTargetPixels,
          !runtimeState.meshInitialBasePassDone,
          runtimeState.options.firstImageErrorTargetPixels
        );
        let usedBytes: number | undefined;
        if (
          !movingSkipStrategy &&
          runtimeState.memoryErrorTarget > runtimeState.requestedErrorTarget &&
          runtimeState.lastMainViewConverged &&
          dependencies.isPipelineIdle()
        ) {
          // Includes resident ancestors/floor pins, not only visible leaves.
          usedBytes = 0;
          for (const tile of cache.usedSet)
            usedBytes += cache.getMemoryUsage(tile);
        }
        const memory = nextMemoryErrorTarget({
          current: runtimeState.memoryErrorTarget,
          requested: runtimeState.requestedErrorTarget,
          base,
          maximum: runtimeState.tiles.root
            ? dependencies.getTileScreenError(
                runtimeState.tiles.root as RuntimeTile
              )
            : base,
          cacheFull: cache.isFull(),
          viewConverged: runtimeState.lastMainViewConverged,
          cachedBytes: cache.cachedBytes,
          usedBytes,
          ceilingBytes: runtimeState.ceilingBytes,
          now: performance.now(),
          changedAt: runtimeState.memoryErrorTargetChangedAt,
        });
        if (!movingSkipStrategy) {
          runtimeState.memoryErrorTarget = memory.target;
          runtimeState.memoryErrorTargetChangedAt = memory.changedAt;
        }
        dependencies.clearErrorTargetTimer();
        if (!movingSkipStrategy && memory.retryInMs !== null) {
          runtimeState.errorTargetTimer = window.setTimeout(() => {
            runtimeState.errorTargetTimer = 0;
            runtimeState.tiles?.dispatchEvent({ type: "needs-update" });
            dependencies.requestRender();
          }, memory.retryInMs);
        }
        const minimumTarget = Math.max(
          runtimeState.requestedErrorTarget,
          runtimeState.memoryErrorTarget
        );
        // Decision: VIEWPORT-REFINEMENT-WAVES-20260916, TILES_COVERAGE.md.
        // Only the actual published view cut advances a wave, never the
        // whole-extent reserve certificate or idle queues. Each wave remains
        // requestable while incomplete; failures retain the previous surface.
        const root = runtimeState.tiles.root;
        const handoverTarget = runtimeState.options.handoverErrorTargetPixels;
        // Decision: ../../../../TILES_COVERAGE.md#configurable-cold-quality-cascades
        // Cold handover is observer coverage, independent of caster detail.
        const demand = dependencies.getTileObserverDemand;
        const readyAt = (error: number) => {
          if (!root) return false;
          const cut = getReadyMeshRegionCut(
            root,
            runtimeState.displayedMeshFrontier,
            error,
            (tile) => demand(tile as RuntimeTile)
          );
          return (
            cut !== null &&
            (handoverTarget === undefined ||
              (cut.length > 0 &&
                cut.every(
                  (tile) => demand(tile as RuntimeTile).errorPixels <= error
                )))
          );
        };
        if (
          !runtimeState.meshInitialHandoverDone &&
          runtimeState.map?.isMoving?.() !== true &&
          readyAt(
            Math.max(
              runtimeState.requestedErrorTarget,
              handoverTarget ??
                initialMeshLoadError(
                  runtimeState.requestedErrorTarget,
                  runtimeState.options.baseErrorTargetPixels
                )
            )
          )
        ) {
          // Decision: ../../../../TILES_COVERAGE.md#viewport-only-cold-replacement-families
          // First observer idle releases offscreen families, even when memory
          // keeps the same target. Shadow/background queues need not be empty.
          runtimeState.meshInitialHandoverDone = true;
          runtimeState.meshDemandSweepPending = true;
          dependencies.resetDeferredTiles();
          runtimeState.tiles.dispatchEvent({ type: "needs-update" });
          dependencies.requestRender();
        }
        const initialTarget = Math.max(base, minimumTarget);
        const initialReady = readyAt(initialTarget);
        const hasReserve =
          Number.isFinite(runtimeState.extentGeometricError) &&
          runtimeState.extentGeometricError > 0;
        const reserveLimited =
          (cache.isFull() ||
            runtimeState.memoryAdmissionPaused ||
            runtimeState.tiles.stats.failed > 0) &&
          !runtimeState.tiles.downloadQueue.running &&
          !runtimeState.tiles.parseQueue.running &&
          !runtimeState.tiles.processNodeQueue.running;
        if (
          !runtimeState.shadowView &&
          initialReady &&
          hasReserve &&
          runtimeState.extentFloorArmed &&
          !runtimeState.extentFloorAuditPending &&
          runtimeState.map?.isMoving?.() !== true &&
          ((dependencies.isPipelineIdle() &&
            runtimeState.extentFloorPending === 0) ||
            reserveLimited)
        )
          runtimeState.meshInitialReserveSettled = true;
        // First-image coverage releases the base pass. Extent reserve
        // completion is background progress, never a visible quality gate.
        if (
          !runtimeState.meshInitialBasePassDone &&
          (initialReady ||
            runtimeState.meshBaseCoverageReady ||
            (dependencies.isPipelineIdle() &&
              runtimeState.displayedMeshFrontier.size > 0))
        ) {
          runtimeState.meshInitialBasePassDone = true;
          dependencies.applyPendingShadowView();
        }
        const stageTarget = resolveMeshStageTarget({
          shadowView: !!runtimeState.shadowView,
          minimumTarget,
          initialTarget,
          handoverTarget,
          handoverReady: runtimeState.meshInitialHandoverDone,
          firstImageReady: runtimeState.meshInitialBasePassDone,
        });
        if (
          runtimeState.effectiveErrorTarget !== stageTarget &&
          !movingSkipStrategy
        ) {
          applyEffectiveErrorTarget(stageTarget);
        }
        return;
      }
      const { zoom, pitch } = readMapView(runtimeState.map);
      const result = nextEffectiveErrorTarget(runtimeState.errorTargetState, {
        now: Date.now(),
        physicallyFull: cache.isFull(),
        pipelineIdle: dependencies.isPipelineIdle(),
        mainConverged: runtimeState.lastMainViewConverged,
        usedBytesMain: runtimeState.usedBytesMain,
        cachedBytes: cache.cachedBytes,
        ceiling: runtimeState.ceilingBytes,
        zoom,
        pitch,
        unusedEvictable: cache.itemList.length > cache.usedSet.size,
        lastProgressAt: runtimeState.lastProgressAt,
      });
      runtimeState.errorTargetState = result.state;
      dependencies.clearErrorTargetTimer();
      if (result.changed) {
        applyEffectiveErrorTarget(runtimeState.errorTargetState.effective);
        return;
      }
      if (result.retryInMs !== null) {
        runtimeState.errorTargetTimer = window.setTimeout(() => {
          runtimeState.errorTargetTimer = 0;
          runtimeState.tiles?.dispatchEvent({ type: "needs-update" });
          dependencies.requestRender();
        }, Math.max(1, Math.ceil(result.retryInMs)));
      }
    };

  const applyErrorTarget = (
    errorTarget: number,
    initialErrorTarget?: number
  ) => {
    const nextErrorTarget = clamp(
      errorTarget,
      TILES_ERROR_TARGET_MIN_PIXELS,
      TILES_ERROR_TARGET_MAX_PIXELS
    );
    // shadow-scene re-applies the same requested target on every content
    // change; only a changed request resets a relaxed effective target.
    const nextInitial =
      initialErrorTarget !== undefined && Number.isFinite(initialErrorTarget)
        ? clamp(
            initialErrorTarget,
            nextErrorTarget,
            TILES_ERROR_TARGET_MAX_PIXELS
          )
        : runtimeState.options.baseErrorTargetPixels;
    const initialChanged =
      nextInitial !== runtimeState.options.baseErrorTargetPixels;
    if (
      runtimeState.requestedErrorTarget === nextErrorTarget &&
      !initialChanged
    )
      return;
    runtimeState.options.baseErrorTargetPixels = nextInitial;
    if (initialChanged) {
      runtimeState.meshInitialReserveSettled = false;
      runtimeState.appliedTilesetMinResolutionPx = Number.NaN;
    }
    runtimeState.requestedErrorTarget = nextErrorTarget;
    // A new request restarts the memory-adaptive target from it.
    runtimeState.memoryErrorTarget = nextErrorTarget;
    runtimeState.memoryErrorTargetChangedAt = 0;
    runtimeState.meshDemandSweepPending =
      runtimeState.options.providesTerrain === true;
    dependencies.resetDeferredTiles();
    resetEffectiveErrorTarget();
    dependencies.requestShadowSelectionRefresh();
    runtimeState.viewQualityAuditPasses = VIEW_QUALITY_AUDIT_PASSES;
    runtimeState.tiles?.dispatchEvent({ type: "needs-update" });
    dependencies.requestRender();
  };

  const requestErrorTarget = (initialErrorTarget?: number) =>
    applyErrorTarget(
      runtimeState.errorTargetOverride ?? runtimeState.configuredErrorTarget,
      initialErrorTarget
    );
  /** The host's target; a consumer override, if any, is applied instead. */
  const setErrorTarget: ThreeTilesRuntimeServices["setErrorTarget"] = (
    errorTarget,
    initialErrorTarget
  ) => {
    runtimeState.configuredErrorTarget = clamp(
      errorTarget,
      TILES_ERROR_TARGET_MIN_PIXELS,
      TILES_ERROR_TARGET_MAX_PIXELS
    );
    requestErrorTarget(initialErrorTarget);
  };
  const setErrorTargetOverride: ThreeTilesRuntimeServices["setErrorTargetOverride"] =
    (errorTarget) => {
      const next =
        errorTarget !== null && Number.isFinite(errorTarget)
          ? errorTarget
          : null;
      if (runtimeState.errorTargetOverride === next) return;
      runtimeState.errorTargetOverride = next;
      requestErrorTarget();
    };
  const getErrorTarget: ThreeTilesRuntimeServices["getErrorTarget"] = () =>
    runtimeState.configuredErrorTarget;

  return {
    applyEffectiveErrorTarget,
    resetEffectiveErrorTarget,
    applyErrorTargetPolicy,
    setErrorTarget,
    setErrorTargetOverride,
    getErrorTarget,
  };
}
