import type { Tile } from "3d-tiles-renderer/core";
import * as THREE from "three";

import type { createTileDrawObserver } from "./three-tiles-draw-observer";
import { TILE_MEMORY_ALLOCATION_ERROR } from "../../core/tile-cache-policy";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import type { RuntimeTile } from "./three-tiles-runtime-types";
import {
  FAILED_LOADING_STATE,
  resolveTileContentUrl,
  UNLOADED_LOADING_STATE,
} from "./three-tiles-runtime-vendor";
import { setTileShadowRole } from "./three-tiles-shadow-role";

/** Handles renderer model, tileset, download, and retry events. */
export function createThreeTilesLoadEvents(
  runtimeState: Pick<
    ThreeTilesRuntimeState,
    | "allocationFailed"
    | "bytesPredictor"
    | "committedMeshCasterFrontier"
    | "committedMeshReceiverFrontier"
    | "deferred"
    | "extentFloorAuditPending"
    | "lastProgressAt"
    | "mainViewIntersectionCache"
    | "meshBaseCoverageReady"
    | "meshContentRevision"
    | "meshDemandSweepPending"
    | "modelLocalBounds"
    | "options"
    | "payloadAwareConcurrency"
    | "shadowRegionRevisions"
    | "shadowRegionWorldBounds"
    | "shadowView"
    | "tileBoundsVisible"
    | "tileRetries"
    | "tiles"
    | "tilesetUrl"
    | "viewQualityAuditPasses"
  >,
  dependencies: Pick<
    ThreeTilesRuntimeServices,
    | "applyMaterialFlags"
    | "applyRequestConcurrency"
    | "applyTilesetMinResolution"
    | "clearKickstartTimer"
    | "getTileDebugProgress"
    | "invalidateShadowRegionRevisions"
    | "maybeEnableShadowSelection"
    | "notifyRequestStateChange"
    | "readModelFrameBounds"
    | "reapplyCacheBoundsIfDrifted"
    | "recordCacheCeilingFailure"
    | "refreshRenderedMaterials"
    | "requestRender"
    | "resetDeferredTiles"
    | "restoreClayMaterials"
    | "restoreLitTextureMaterials"
    | "scheduleRequestBackoffRecovery"
  >,
  drawObserver: ReturnType<typeof createTileDrawObserver>,
  noteTileActivity: (tile: Tile) => void,
  probeGroundReference: (tile?: Tile) => void,
  isDeferredMaterialReady: (tile: Tile) => boolean,
  localTelemetry: boolean
) {
  const handleModelLoad: ThreeTilesRuntimeServices["handleModelLoad"] =
    (event: { scene?: THREE.Object3D; tile?: Tile; url?: string }) => {
      if (event.tile) {
        dependencies.getTileDebugProgress(event.tile).publicationStartedAt =
          performance.now();
        dependencies.getTileDebugProgress(event.tile).loadedAt ??=
          performance.now();
        noteTileActivity(event.tile);
      }
      runtimeState.meshContentRevision += 1;
      if (event.tile) {
        runtimeState.shadowRegionWorldBounds.delete(event.tile);
        runtimeState.mainViewIntersectionCache.delete(event.tile);
      }
      if (event.tile)
        runtimeState.tileRetries.handleSuccess(event.tile, event.url);
      const changedBounds: THREE.Box3[] = [];
      if (event.scene) {
        if (!event.tile || isDeferredMaterialReady(event.tile))
          dependencies.refreshRenderedMaterials(event.scene);
        else dependencies.applyMaterialFlags(event.scene);
        const bounds = dependencies.readModelFrameBounds(
          event.scene,
          new THREE.Box3()
        );
        if (!bounds.isEmpty()) changedBounds.push(bounds.clone());
      }
      probeGroundReference(event.tile);
      dependencies.invalidateShadowRegionRevisions(changedBounds);
      // Register partial caster materials; only atomic handover invalidates pages.
      const unpublishedMesh =
        runtimeState.options.providesTerrain &&
        runtimeState.shadowView &&
        event.tile &&
        !runtimeState.committedMeshCasterFrontier.has(event.tile) &&
        !runtimeState.committedMeshReceiverFrontier.has(event.tile);
      if (unpublishedMesh && event.scene)
        setTileShadowRole(event.scene, { receiver: false, caster: false });
      runtimeState.options.onContentChanged?.(
        unpublishedMesh ? [] : changedBounds,
        event.scene ? [event.scene] : undefined
      );
      runtimeState.lastProgressAt = Date.now();
      if (event.tile && runtimeState.tiles) {
        const registeredBytes = runtimeState.tiles.lruCache.getMemoryUsage(
          event.tile
        );
        runtimeState.bytesPredictor.observe(
          {
            url: event.url ?? resolveTileContentUrl(event.tile),
            geometricError: event.tile.geometricError,
          },
          registeredBytes
        );
        dependencies.reapplyCacheBoundsIfDrifted();
      }
      runtimeState.payloadAwareConcurrency.observeSuccess();
      dependencies.applyRequestConcurrency();
      if (event.tile && event.scene)
        drawObserver.attach(event.tile as RuntimeTile, event.scene);
      dependencies.notifyRequestStateChange();
      dependencies.requestRender();
      if (event.tile)
        dependencies.getTileDebugProgress(event.tile).publicationFinishedAt =
          performance.now();
    };

  const handleModelDispose: ThreeTilesRuntimeServices["handleModelDispose"] =
    (event: { scene?: THREE.Object3D; tile?: Tile }) => {
      if (event.scene) drawObserver.detach(event.scene);
      runtimeState.meshContentRevision += 1;
      const changedBounds: THREE.Box3[] = [];
      if (event.scene) {
        const bounds = dependencies.readModelFrameBounds(
          event.scene,
          new THREE.Box3()
        );
        if (!bounds.isEmpty()) changedBounds.push(bounds);
        runtimeState.modelLocalBounds.delete(event.scene);
      }
      if (event.tile) {
        runtimeState.shadowRegionWorldBounds.delete(event.tile);
        runtimeState.mainViewIntersectionCache.delete(event.tile);
      }
      dependencies.invalidateShadowRegionRevisions(changedBounds);
      if (event.scene) {
        dependencies.restoreClayMaterials(event.scene);
        dependencies.restoreLitTextureMaterials(event.scene);
      }
      runtimeState.options.onContentChanged?.(changedBounds);
      // Freed space admits waiting tiles only through a new traversal, which
      // the change-gated update would otherwise wait for the camera to trigger.
      if (runtimeState.tiles && !runtimeState.tiles.lruCache.isFull()) {
        runtimeState.tiles.dispatchEvent({ type: "needs-update" });
        dependencies.requestRender();
      }
    };

  const handleTilesetLoad: ThreeTilesRuntimeServices["handleTilesetLoad"] =
    (event: { url?: string }) => {
      if (localTelemetry && runtimeState.tileBoundsVisible)
        console.debug(
          "[tiles3d-debug] tileset loaded",
          event.url ?? runtimeState.tilesetUrl
        );
      runtimeState.meshContentRevision += 1;
      runtimeState.shadowRegionRevisions.clear();
      runtimeState.mainViewIntersectionCache = new WeakMap();
      dependencies.clearKickstartTimer();
      runtimeState.tileRetries.handleSuccess(null, event.url);
      runtimeState.payloadAwareConcurrency.observeSuccess();
      dependencies.applyTilesetMinResolution();
      dependencies.applyRequestConcurrency();
      dependencies.requestRender();
    };

  // D8: retry admission keeps failed tiles UNLOADED, retaining the parent cut.
  const handleLoadError: ThreeTilesRuntimeServices["handleLoadError"] =
    (event: { tile?: Tile | null; url?: string | URL; error?: unknown }) => {
      console.warn("[tiles3d-debug] load error", {
        url: String(event.url ?? runtimeState.tilesetUrl),
        error: String(event.error),
      });
      if (TILE_MEMORY_ALLOCATION_ERROR.test(String(event.error))) {
        runtimeState.allocationFailed = true;
        dependencies.recordCacheCeilingFailure("allocation");
        dependencies.applyRequestConcurrency();
      }
      const failedTile = event.tile ?? null;
      if (failedTile && runtimeState.tileBoundsVisible) {
        dependencies.getTileDebugProgress(failedTile).lastError = String(
          event.error
        ).slice(0, 240);
        noteTileActivity(failedTile);
      }
      if (failedTile && runtimeState.deferred.has(failedTile)) return;
      const retryState = runtimeState.tileRetries.handleFailure(
        failedTile,
        event.url,
        event.error
      );
      if (failedTile && runtimeState.tiles && retryState !== "ignored") {
        const wasFailed =
          failedTile.internal.loadingState === FAILED_LOADING_STATE;
        const removed = runtimeState.tiles.lruCache.remove(failedTile);
        if (!removed && wasFailed) {
          failedTile.internal.loadingState = UNLOADED_LOADING_STATE;
        }
        if (wasFailed) {
          runtimeState.tiles.stats.failed = Math.max(
            0,
            runtimeState.tiles.stats.failed - 1
          );
        }
        if (retryState === "exhausted") {
          runtimeState.tiles.dispatchEvent({ type: "needs-update" });
          dependencies.requestRender();
        }
      }
      runtimeState.payloadAwareConcurrency.observeFailure(event.error);
      dependencies.applyRequestConcurrency();
      dependencies.scheduleRequestBackoffRecovery();
      // A failed root is retried by the controller; tile errors keep the
      // kickstart running until the root tileset arrives.
      if (!failedTile) dependencies.clearKickstartTimer();
      dependencies.maybeEnableShadowSelection();
      dependencies.notifyRequestStateChange();
    };

  const handleTilesLoadEnd: ThreeTilesRuntimeServices["handleTilesLoadEnd"] =
    () => {
      // Completion wakes one audit for unresolved coverage; deferred tiles
      // alone must not sustain an endless render loop.
      if (
        runtimeState.options.providesTerrain &&
        (!runtimeState.meshBaseCoverageReady ||
          runtimeState.extentFloorAuditPending ||
          runtimeState.deferred.size > 0) &&
        !runtimeState.meshDemandSweepPending &&
        runtimeState.viewQualityAuditPasses === 0
      ) {
        runtimeState.meshDemandSweepPending = true;
        dependencies.resetDeferredTiles();
        runtimeState.viewQualityAuditPasses = 1;
        runtimeState.tiles?.dispatchEvent({ type: "needs-update" });
        dependencies.requestRender();
      }
      dependencies.notifyRequestStateChange();
      dependencies.maybeEnableShadowSelection();
    };

  return {
    handleModelLoad,
    handleModelDispose,
    handleTilesetLoad,
    handleLoadError,
    handleTilesLoadEnd,
  };
}
