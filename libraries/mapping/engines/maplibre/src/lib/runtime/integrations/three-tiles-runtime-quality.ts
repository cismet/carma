import { clamp } from "@carma-commons/math";
import { resolveMeshStageTarget } from "../../core/tile-scheduling-policy";
import {
  createEffectiveErrorTargetState,
  nextEffectiveErrorTarget,
} from "../../core/effective-error-target";
import { initialMeshLoadError } from "../../core/mesh-error-policy";
import { TILES_LOAD_POLICY } from "../../core/tile-load-config";
import {
  EMPTY_MEMORY_TARGET_RECOVERY,
  nextMemoryErrorTarget,
  type MemoryTargetRecovery,
} from "../../core/memory-error-target";
import { isMeshRegionAtError } from "../../core/mesh-tile-coverage";
import {
  TILES_ERROR_TARGET_MAX_PIXELS,
  TILES_ERROR_TARGET_MIN_PIXELS,
  VIEW_QUALITY_AUDIT_PASSES,
  MESH_ALLOCATION_RECOVERY_PHASE,
} from "./three-tiles-runtime-config";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import type {
  RuntimePriorityQueue,
  RuntimeTile,
} from "./three-tiles-runtime-types";
import { readMapView } from "./three-tiles-runtime-vendor";
import { readMemoryProbeFacts } from "./three-tiles-memory-probe";

/** Owns quality effects; policy inputs remain explicit and current. */
export function createThreeTilesQuality(
  runtimeState: Pick<
    ThreeTilesRuntimeState,
    | "appliedTilesetMinResolutionPx"
    | "allocationFailed"
    | "allocationRecovery"
    | "bytesPredictor"
    | "committedMeshCasterFrontier"
    | "contextLost"
    | "lastActiveViewsConverged"
    | "loadingPaused"
    | "loadedResidentBytes"
    | "pendingMeshReceiverFrontier"
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
    | "meshShadowReserve"
    | "meshDemandSweepPending"
    | "meshInitialBasePassDone"
    | "meshInitialHandoverDone"
    | "meshInitialReserveSettled"
    | "options"
    | "requestedErrorTarget"
    | "shadowView"
    | "shadowReceiverMaskConverged"
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
    | "getTileCameraDemand"
    | "requestRender"
    | "requestShadowSelectionRefresh"
    | "resetDeferredTiles"
  >
) {
  let memoryRecovery: MemoryTargetRecovery = EMPTY_MEMORY_TARGET_RECOVERY;
  let probeInspection: {
    at: number;
    cachedBytes: number;
    ceiling: number;
    target: number;
    views: ThreeTilesRuntimeState["tileCameraDemand"];
    shadow: ThreeTilesRuntimeState["shadowView"];
    facts: ReturnType<typeof readMemoryProbeFacts>;
  } | null = null;
  const applyEffectiveErrorTarget: ThreeTilesRuntimeServices["applyEffectiveErrorTarget"] =
    (nextTarget: number) => {
      if (runtimeState.effectiveErrorTarget === nextTarget) return;
      runtimeState.effectiveErrorTarget = nextTarget;
      // The previous proof belongs to the previous threshold. Do not release
      // background work or announce completion before the new frame proves it.
      runtimeState.lastMainViewConverged = false;
      runtimeState.lastActiveViewsConverged = false;
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
      // Advance complete screen-space-error waves, retaining finer resident
      // regions while unfinished regions catch up to the current threshold.
      if (runtimeState.options.providesTerrain) {
        // During movement, admit new ground at the base target; retain visible
        // detail and resume refinement at moveend.
        const movingSkipStrategy =
          runtimeState.tiles.loadAncestors === false &&
          runtimeState.map?.isMoving?.() === true;
        // R6: resident pressure raises admission error; headroom allows recovery.
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
        const probeSettled =
          (runtimeState.memoryErrorTarget > runtimeState.requestedErrorTarget ||
            memoryRecovery.pending !== null) &&
          runtimeState.map?.isMoving?.() !== true &&
          !runtimeState.memoryAdmissionPaused &&
          !runtimeState.loadingPaused &&
          !runtimeState.contextLost &&
          !runtimeState.allocationFailed &&
          (!runtimeState.allocationRecovery ||
            runtimeState.allocationRecovery.phase ===
              MESH_ALLOCATION_RECOVERY_PHASE.RECOVERED) &&
          runtimeState.lastActiveViewsConverged === true &&
          !runtimeState.pendingMeshReceiverFrontier?.size &&
          dependencies.isPipelineIdle() &&
          [
            runtimeState.tiles.parseQueue,
            runtimeState.tiles.processNodeQueue,
            ...runtimeState.tiles.downloadQueue.originQueues.values(),
          ].every((entry) => {
            const queue = entry as RuntimePriorityQueue;
            return queue.currJobs === 0 && queue.items.length === 0;
          });
        const now = performance.now();
        const nextTarget = Math.max(
          runtimeState.requestedErrorTarget,
          runtimeState.memoryErrorTarget / TILES_LOAD_POLICY.memoryTargetStep
        );
        const available = runtimeState.ceilingBytes - cache.cachedBytes;
        const required = Math.max(
          runtimeState.bytesPredictor.globalEstimate(),
          runtimeState.ceilingBytes *
            TILES_LOAD_POLICY.memoryTargetProbeHeadroom
        );
        const failed =
          memoryRecovery.pending &&
          runtimeState.memoryErrorTarget > memoryRecovery.pending.target
            ? memoryRecovery.pending
            : memoryRecovery.failed;
        let facts: ReturnType<typeof readMemoryProbeFacts> | undefined;
        if (
          probeSettled &&
          now - runtimeState.memoryErrorTargetChangedAt >
            TILES_LOAD_POLICY.memoryTargetRelaxAfterMs &&
          available >= required &&
          (!failed ||
            nextTarget > failed.target ||
            available >= failed.headroomBytes + required)
        ) {
          // Reuse stable facts so sun animation does not rescan families per frame.
          if (
            !probeInspection ||
            probeInspection.cachedBytes !== cache.cachedBytes ||
            probeInspection.ceiling !== runtimeState.ceilingBytes ||
            probeInspection.target !== nextTarget ||
            probeInspection.views !== runtimeState.tileCameraDemand ||
            probeInspection.shadow !== runtimeState.shadowView ||
            now - probeInspection.at >
              TILES_LOAD_POLICY.memoryTargetRelaxAfterMs
          )
            probeInspection = {
              at: now,
              cachedBytes: cache.cachedBytes,
              ceiling: runtimeState.ceilingBytes,
              target: nextTarget,
              views: runtimeState.tileCameraDemand,
              shadow: runtimeState.shadowView,
              facts: readMemoryProbeFacts(
                cache,
                new Set([
                  ...runtimeState.displayedMeshFrontier,
                  ...runtimeState.committedMeshCasterFrontier,
                ]),
                runtimeState.bytesPredictor,
                dependencies.getTileCameraDemand,
                nextTarget / runtimeState.requestedErrorTarget
              ),
            };
          facts = probeInspection.facts;
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
          now,
          changedAt: runtimeState.memoryErrorTargetChangedAt,
          settled: probeSettled,
          residentBytes:
            facts?.residentBytes ??
            runtimeState.loadedResidentBytes ??
            undefined,
          memoryFailure:
            runtimeState.allocationFailed || runtimeState.contextLost,
          minimumProbeBytes: facts?.minimumProbeBytes ?? required,
          recovery: memoryRecovery,
        });
        if (!movingSkipStrategy) {
          memoryRecovery = memory.recovery;
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
        const readyAt = (error: number) =>
          !!root &&
          isMeshRegionAtError(
            root,
            runtimeState.displayedMeshFrontier,
            error,
            (tile) => demand(tile as RuntimeTile)
          );
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
          currentTarget: runtimeState.effectiveErrorTarget,
          stageReady:
            readyAt(runtimeState.effectiveErrorTarget) &&
            (!runtimeState.shadowView ||
              (runtimeState.shadowReceiverMaskConverged &&
                runtimeState.meshShadowReserve.ready &&
                runtimeState.meshShadowReserve.support.size === 0 &&
                !runtimeState.pendingMeshReceiverFrontier?.size)),
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
    // A new explicit quality request starts a distinct recovery objective.
    memoryRecovery = EMPTY_MEMORY_TARGET_RECOVERY;
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
