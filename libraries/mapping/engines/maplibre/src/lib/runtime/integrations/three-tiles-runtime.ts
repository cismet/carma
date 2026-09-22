import { createThreeTilesAppearance } from "./three-tiles-runtime-appearance";
import { createThreeTilesDebug } from "./three-tiles-runtime-debug";
import { createThreeTilesLifecycle } from "./three-tiles-runtime-lifecycle";
import { createThreeTilesLoading } from "./three-tiles-runtime-loading";
import { createThreeTilesProjection } from "./three-tiles-runtime-projection";
import {
  collectTilesetFloorRoots,
  createThreeTilesRuntimeCoverageDiagnostics,
  getTilesetFloorContentRevision,
} from "./three-tiles-runtime-coverage";
import { createThreeTilesShadows } from "./three-tiles-runtime-shadows";
import { createThreeTilesSpatial } from "./three-tiles-runtime-spatial";
import { createThreeTilesRuntimeState } from "./three-tiles-runtime-state";
import { createThreeTilesSurfaces } from "./three-tiles-runtime-surfaces";
import type {
  ThreeTilesRuntime,
  ThreeTilesRuntimeOptions,
} from "./three-tiles-runtime-types";

/**
 * Compose the 3D Tiles integration; policy and render work belong to its owners.
 * Decision: explicit, instance-local state slices and callbacks keep construction
 * inert and avoid runtime import cycles. Stable control groups are separate from
 * the engine adapter; see RUNTIME-API-20260909 and RUNTIME-SPLIT-20260909 in README.md.
 */
export function buildThreeTilesRuntime(
  layerId: string,
  tilesetUrl: string,
  originLngLat: [number, number],
  options: ThreeTilesRuntimeOptions = {}
): ThreeTilesRuntime {
  const state = createThreeTilesRuntimeState(
    layerId,
    tilesetUrl,
    originLngLat,
    options
  );
  const coverageDiagnostics = createThreeTilesRuntimeCoverageDiagnostics();
  let coverageSampledAt = Number.NEGATIVE_INFINITY;
  let floorCacheFrame = Number.NaN;
  let floorCacheError = Number.NaN;
  let floorCacheContentRevision = "";
  let floorCacheRevision = 0;
  let floorRoots: ReturnType<typeof collectTilesetFloorRoots> = [];
  const getCoverageStatus = () => {
    const now = performance.now();
    if (now - coverageSampledAt < 500)
      return coverageDiagnostics.getCoverageStatus();
    coverageSampledAt = now;
    const tiles = state.tiles;
    const root = tiles?.root;
    const frame = tiles?.frameCount ?? -1;
    const contentRevision = getTilesetFloorContentRevision(floorRoots);
    if (
      root &&
      (frame !== floorCacheFrame ||
        state.extentGeometricError !== floorCacheError ||
        contentRevision !== floorCacheContentRevision)
    ) {
      floorRoots = collectTilesetFloorRoots(root, state.extentGeometricError);
      floorCacheFrame = frame;
      floorCacheError = state.extentGeometricError;
      floorCacheContentRevision = getTilesetFloorContentRevision(floorRoots);
      floorCacheRevision += 1;
    } else if (!root && floorRoots.length > 0) {
      floorRoots = [];
      floorCacheFrame = frame;
      floorCacheError = state.extentGeometricError;
      floorCacheContentRevision = "";
      floorCacheRevision += 1;
    }
    const enabled =
      state.runtimeVisible && state.options.providesTerrain === true;
    const sourcePendingMetadata =
      enabled &&
      (!root?.internal || !Number.isFinite(state.extentGeometricError));
    const cache = tiles?.lruCache as { cachedBytes?: number } | undefined;
    const stats = tiles?.stats;
    return coverageDiagnostics.update({
      traversalRevision: floorCacheRevision,
      enabled,
      sourcePendingMetadata,
      floorArmed: state.extentFloorArmed,
      visibleBaseReady: state.meshBaseCoverageReady,
      floorRoots,
      displayed: state.displayedMeshFrontier,
      underlay: state.meshUnderlayFrontier,
      pending: state.extentFloorPending,
      queued: stats?.queued ?? 0,
      downloading: stats?.downloading ?? 0,
      parsing: stats?.parsing ?? 0,
      requestedErrorTarget: state.requestedErrorTarget,
      effectiveErrorTarget: state.effectiveErrorTarget,
      paused: state.loadingPaused || state.memoryAdmissionPaused,
      cacheBytes: cache?.cachedBytes ?? 0,
      ceilingBytes: state.ceilingBytes,
    });
  };
  // Callbacks may reference later owners, but factories only construct closures.
  // Engine subscriptions and traversal start in onAdd, after all owners exist.
  const loading = createThreeTilesLoading(state, {
    applyPendingShadowView: (...args) =>
      shadows.applyPendingShadowView(...args),
    getTileRequestPriority: (...args) =>
      spatial.getTileRequestPriority(...args),
    getTileCameraDemand: (...args) => spatial.getTileCameraDemand(...args),
    requestShadowSelectionRefresh: (...args) =>
      shadows.requestShadowSelectionRefresh(...args),
    setShadowSelectionEnabled: (...args) =>
      shadows.setShadowSelectionEnabled(...args),
    isTileInMainView: (...args) => spatial.isTileInMainView(...args),
    getTileObserverDemand: (...args) => spatial.getTileObserverDemand(...args),
    maybeEnableShadowSelection: (...args) =>
      shadows.maybeEnableShadowSelection(...args),
    isTileInPrefetchMargin: (...args) =>
      spatial.isTileInPrefetchMargin(...args),
    getTileCenterness: (...args) => spatial.getTileCenterness(...args),
    getTileScreenError: (...args) => spatial.getTileScreenError(...args),
  });
  const appearance = createThreeTilesAppearance(state, {
    resolveRenderSide: (...args) => surfaces.resolveRenderSide(...args),
    asMaterialArray: (...args) => surfaces.asMaterialArray(...args),
    normalizeSeparatedBuildingSurfaces: (...args) =>
      surfaces.normalizeSeparatedBuildingSurfaces(...args),
    patchMaterialForProjection: (...args) =>
      projection.patchMaterialForProjection(...args),
    applyCacheBudget: (...args) => loading.applyCacheBudget(...args),
  });
  const spatial = createThreeTilesSpatial(state, {
    getStableTileId: (...args) => debug.getStableTileId(...args),
    getTileLoadReason: (...args) => shadows.getTileLoadReason(...args),
  });
  const projection = createThreeTilesProjection(state);
  const surfaces = createThreeTilesSurfaces(state);
  const shadows = createThreeTilesShadows(state, {
    isTileInMainView: (...args) => spatial.isTileInMainView(...args),
    isChildUnloadable: (...args) => spatial.isChildUnloadable(...args),
    updateRootWorldBounds: (...args) => spatial.updateRootWorldBounds(...args),
    updateFrameFromTiles: () => spatial.updateFrameFromTiles(),
    getTileScreenError: (...args) => spatial.getTileScreenError(...args),
    getStableTileId: (...args) => debug.getStableTileId(...args),
    getTileCenterness: (...args) => spatial.getTileCenterness(...args),
    getTileDebugId: (...args) => debug.getTileDebugId(...args),
    recordTileWait: (...args) => debug.recordTileWait(...args),
    requestRender: (...args) => loading.requestRender(...args),
    isPipelineIdle: (...args) => loading.isPipelineIdle(...args),
    applyRequestConcurrency: (...args) =>
      loading.applyRequestConcurrency(...args),
    notifyRequestStateChange: (...args) =>
      loading.notifyRequestStateChange(...args),
  });
  const debug = createThreeTilesDebug(state, {
    isTileInMainView: (...args) => spatial.isTileInMainView(...args),
    updateRootWorldBounds: (...args) => spatial.updateRootWorldBounds(...args),
    createReceiverSnapshot: (...args) =>
      shadows.createReceiverSnapshot(...args),
    getTileScreenError: (...args) => spatial.getTileScreenError(...args),
    peekShadowRegionRevision: (...args) =>
      shadows.peekShadowRegionRevision(...args),
  });
  const lifecycle = createThreeTilesLifecycle(state, {
    isTileNeededForMeshCoverage: (...args) =>
      spatial.isTileNeededForMeshCoverage(...args),

    isTileInPrefetchMargin: (...args) =>
      spatial.isTileInPrefetchMargin(...args),
    recordCacheCeilingFailure: (...args) =>
      loading.recordCacheCeilingFailure(...args),
    endCacheCeilingSession: () => loading.endCacheCeilingSession(),
    getTileRequestPriority: (...args) =>
      spatial.getTileRequestPriority(...args),
    getTileCameraDemand: (...args) => spatial.getTileCameraDemand(...args),
    getTileDebugProgress: (...args) => debug.getTileDebugProgress(...args),
    recordTileWait: (...args) => debug.recordTileWait(...args),
    drainTileWaitEvents: () => debug.drainTileWaitEvents(),
    beginTileWaitObservation: () => debug.beginTileWaitObservation(),
    endTileWaitObservation: () => debug.endTileWaitObservation(),
    refreshRenderedMaterials: (...args) =>
      appearance.refreshRenderedMaterials(...args),
    applyMaterialFlags: (...args) => appearance.applyMaterialFlags(...args),
    readModelFrameBounds: (...args) => spatial.readModelFrameBounds(...args),
    updateFrameFromTiles: () => spatial.updateFrameFromTiles(),
    invalidateShadowRegionRevisions: (...args) =>
      shadows.invalidateShadowRegionRevisions(...args),
    reapplyCacheBoundsIfDrifted: (...args) =>
      loading.reapplyCacheBoundsIfDrifted(...args),
    applyRequestConcurrency: (...args) =>
      loading.applyRequestConcurrency(...args),
    applyTilesetMinResolution: () => loading.applyTilesetMinResolution(),
    notifyRequestStateChange: (...args) =>
      loading.notifyRequestStateChange(...args),
    requestRender: (...args) => loading.requestRender(...args),
    restoreClayMaterials: (...args) => appearance.restoreClayMaterials(...args),
    restoreLitTextureMaterials: (...args) =>
      appearance.restoreLitTextureMaterials(...args),
    clearKickstartTimer: (...args) => loading.clearKickstartTimer(...args),
    scheduleRequestBackoffRecovery: (...args) =>
      loading.scheduleRequestBackoffRecovery(...args),
    maybeEnableShadowSelection: (...args) =>
      shadows.maybeEnableShadowSelection(...args),
    resetDeferredTiles: (...args) => loading.resetDeferredTiles(...args),
    requestShadowSelectionRefresh: (...args) =>
      shadows.requestShadowSelectionRefresh(...args),
    recordTileIteration: (...args) => debug.recordTileIteration(...args),
    applyTileDeferral: (...args) => loading.applyTileDeferral(...args),
    isTileInMainView: (...args) => spatial.isTileInMainView(...args),
    getTileObserverDemand: (...args) => spatial.getTileObserverDemand(...args),
    assignTilePriority: (...args) => loading.assignTilePriority(...args),
    handleWireBytes: (...args) => loading.handleWireBytes(...args),
    syncTileDebugOverlay: (...args) => debug.syncTileDebugOverlay(...args),
    applyCacheBudget: (...args) => loading.applyCacheBudget(...args),
    initialEffectiveErrorTarget: (...args) =>
      loading.initialEffectiveErrorTarget(...args),
    applyEffectiveErrorTarget: (...args) =>
      loading.applyEffectiveErrorTarget(...args),
    runDownloadQueues: (...args) => loading.runDownloadQueues(...args),
    handleContextLost: (...args) => loading.handleContextLost(...args),
    handleContextRestored: (...args) => loading.handleContextRestored(...args),
    handleVisibilityChange: (...args) =>
      loading.handleVisibilityChange(...args),
    syncProjector: (...args) => projection.syncProjector(...args),
    prepareViewFrustums: (...args) => spatial.prepareViewFrustums(...args),
    getTileScreenError: (...args) => spatial.getTileScreenError(...args),
    getTileRingIndex: (...args) => spatial.getTileRingIndex(...args),
    advanceMeshShadowCorridors: (...args) =>
      shadows.advanceMeshShadowCorridors(...args),
    maybeFinalizeShadowSelection: (...args) =>
      shadows.maybeFinalizeShadowSelection(...args),
    measureUsedBytesMain: (...args) => loading.measureUsedBytesMain(...args),
    mainViewConverged: (...args) => spatial.mainViewConverged(...args),
    mainViewWithinErrorFactor: (...args) =>
      spatial.mainViewWithinErrorFactor(...args),
    applyErrorTargetPolicy: (...args) =>
      loading.applyErrorTargetPolicy(...args),
    sweepSettledMeshDemand: (...args) =>
      loading.sweepSettledMeshDemand(...args),
    scheduleSettledMeshAudit: (...args) =>
      loading.scheduleSettledMeshAudit(...args),
    prioritizeQueuedTiles: (...args) => loading.prioritizeQueuedTiles(...args),
    clearErrorTargetTimer: (...args) => loading.clearErrorTargetTimer(...args),
    clearHiddenWipeTimer: (...args) => loading.clearHiddenWipeTimer(...args),
    disposeClayState: (...args) => appearance.disposeClayState(...args),
    disposeLitTextureState: (...args) =>
      appearance.disposeLitTextureState(...args),
    restoreShadowSides: (...args) => appearance.restoreShadowSides(...args),
  });
  const runtime: ThreeTilesRuntime = {
    scene: {
      id: state.layerId,
      originLngLat: state.originLngLat,
      root: state.orientationGroup,
      mountsOnLocalFrame: state.options.cameraLocalMount === true,
      providesTerrain: state.options.providesTerrain === true,
      receivesMapStyleTexture:
        state.options.providesTerrain === true &&
        state.options.mapStyleDrape !== "none"
          ? (material) => !surfaces.isRenderedBuildingSurface(material)
          : false,
      mapStyleProjectionBlend:
        state.options.providesTerrain === true &&
        state.options.mapStyleDrape !== "none"
          ? "overlay"
          : undefined,
      mapStyleProjectionVersion: appearance.mapStyleProjectionVersion,
      onAdd: lifecycle.onAdd,
      update: lifecycle.update,
      dispose: lifecycle.dispose,
      hasRenderableContent: lifecycle.hasRenderableContent,
      setErrorTarget: loading.setErrorTarget,
      setErrorTargetOverride: loading.setErrorTargetOverride,
      getErrorTarget: loading.getErrorTarget,
      setCacheBudget: loading.setCacheBudget,
      getRequestDemand: loading.getRequestDemand,
      prefetchZoom: lifecycle.prefetchZoom,
      setPrefetchCameraView: lifecycle.setPrefetchCameraView,
      getMotionPrefetchStats: lifecycle.getMotionPrefetchStats,
      setShadowSimulationStyle: appearance.setShadowSimulationStyle,
      setShadowView: shadows.setShadowView,
      isShadowRegionReady: shadows.isShadowRegionReady,
      getShadowRegionRevision: shadows.getShadowRegionRevision,
      getShadowRegionDiagnostics: shadows.getShadowRegionDiagnostics,
      isMainViewReady: spatial.isMainViewReady,
      isBaseViewReady: () => state.meshBaseCoverageReady,
      getViewElevationRange: spatial.getViewElevationRange,
      getActiveTileVolumes: spatial.getActiveTileVolumes,
      onShadowPresented: (time) => {
        for (const tile of state.tiles?.visibleTiles ?? []) {
          const progress = state.tileDebugProgress.get(tile);
          if (
            progress &&
            (state.shadowView
              ? state.committedMeshCasterFrontier.has(tile)
              : progress.visibleAt !== undefined)
          ) {
            progress.shadowPresentedAt ??= time;
            debug.recordTileWait(tile, "shadow", null);
          }
        }
      },
      setTileBoundsVisible: debug.setTileBoundsVisible,
    },
    appearance: {
      setVisible: lifecycle.setVisible,
      setProjector: projection.setProjector,
      setWhiteShading: appearance.setWhiteShading,
      setClayMaterial: appearance.setClayMaterial,
      setClayColor: appearance.setClayColor,
      setOpacity: appearance.setOpacity,
      setWireframe: appearance.setWireframe,
      setOutlineVisible: appearance.setOutlineVisible,
      setOutlineStyle: appearance.setOutlineStyle,
    },
    loading: {
      setErrorTarget: loading.setErrorTarget,
      setErrorTargetOverride: loading.setErrorTargetOverride,
      getErrorTarget: loading.getErrorTarget,
      setCacheBudget: loading.setCacheBudget,
      setRequestConcurrency: loading.setRequestConcurrency,
      getRequestDemand: loading.getRequestDemand,
      setPaused: (paused) => {
        state.loadingPaused = paused;
        loading.applyRequestConcurrency();
        state.tiles?.dispatchEvent({ type: "needs-update" });
      },
      setFoveation: (weight) => {
        state.foveationWeight = Math.max(0, weight);
        state.tiles?.dispatchEvent({ type: "needs-update" });
      },
      setTilesetMinResolution: (px) => {
        state.tilesetMinResolutionPx = px;
        loading.applyTilesetMinResolution();
      },
      setParseConcurrency: (jobs) => {
        state.normalParseConcurrency = Math.max(1, Math.floor(jobs));
        loading.applyRequestConcurrency();
      },
      getMemoryErrorTarget: () => state.memoryErrorTarget,
      getCoverageStatus,
      getDrawStatus: lifecycle.getDrawStatus,
    },
    placement: {
      originMerc: state.originMerc,
      mScale: state.mScale,
      setHeightOffset: lifecycle.setHeightOffset,
    },
    debug: {
      readState: debug.readState,
      setDiagnosticsEnabled: debug.setDiagnosticsEnabled,
      setTelemetryEnabled: debug.setTelemetryEnabled,
      setTileBoundsVisible: debug.setTileBoundsVisible,
    },
  };
  state.hostHandle = runtime;
  return runtime;
}
