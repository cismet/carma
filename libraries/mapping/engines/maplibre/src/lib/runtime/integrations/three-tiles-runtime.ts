import { createThreeTilesAppearance } from "./three-tiles-runtime-appearance";
import { createThreeTilesDebug } from "./three-tiles-runtime-debug";
import { createThreeTilesLifecycle } from "./three-tiles-runtime-lifecycle";
import { createThreeTilesLoading } from "./three-tiles-runtime-loading";
import { createThreeTilesProjection } from "./three-tiles-runtime-projection";
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
  // Callbacks may reference later owners, but factories only construct closures.
  // Engine subscriptions and traversal start in onAdd, after all owners exist.
  const loading = createThreeTilesLoading(state, {
    requestShadowSelectionRefresh: (...args) =>
      shadows.requestShadowSelectionRefresh(...args),
    setShadowSelectionEnabled: (...args) =>
      shadows.setShadowSelectionEnabled(...args),
    isTileInMainView: (...args) => spatial.isTileInMainView(...args),
    maybeEnableShadowSelection: (...args) =>
      shadows.maybeEnableShadowSelection(...args),
    isTileInPrefetchMargin: (...args) =>
      spatial.isTileInPrefetchMargin(...args),
    getTileCenterness: (...args) => spatial.getTileCenterness(...args),
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
    getTileScreenError: (...args) => spatial.getTileScreenError(...args),
    getStableTileId: (...args) => debug.getStableTileId(...args),
    getTileCenterness: (...args) => spatial.getTileCenterness(...args),
    getTileDebugId: (...args) => debug.getTileDebugId(...args),
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
    getTileDebugProgress: (...args) => debug.getTileDebugProgress(...args),
    refreshRenderedMaterials: (...args) =>
      appearance.refreshRenderedMaterials(...args),
    applyMaterialFlags: (...args) => appearance.applyMaterialFlags(...args),
    readModelWorldBounds: (...args) => spatial.readModelWorldBounds(...args),
    invalidateShadowRegionRevisions: (...args) =>
      shadows.invalidateShadowRegionRevisions(...args),
    reapplyCacheBoundsIfDrifted: (...args) =>
      loading.reapplyCacheBoundsIfDrifted(...args),
    applyRequestConcurrency: (...args) =>
      loading.applyRequestConcurrency(...args),
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
    assignTilePriority: (...args) => loading.assignTilePriority(...args),
    handleWireBytes: (...args) => loading.handleWireBytes(...args),
    syncTileDebugOverlay: (...args) => debug.syncTileDebugOverlay(...args),
    applyCacheBudget: (...args) => loading.applyCacheBudget(...args),
    initialEffectiveErrorTarget: (...args) =>
      loading.initialEffectiveErrorTarget(...args),
    runDownloadQueues: (...args) => loading.runDownloadQueues(...args),
    handleContextLost: (...args) => loading.handleContextLost(...args),
    handleContextRestored: (...args) => loading.handleContextRestored(...args),
    handleVisibilityChange: (...args) =>
      loading.handleVisibilityChange(...args),
    syncProjector: (...args) => projection.syncProjector(...args),
    prepareViewFrustums: (...args) => spatial.prepareViewFrustums(...args),
    getTileScreenError: (...args) => spatial.getTileScreenError(...args),
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
  return {
    scene: {
      id: state.layerId,
      originLngLat: state.originLngLat,
      root: state.orientationGroup,
      providesTerrain: state.options.providesTerrain === true,
      receivesMapStyleTexture:
        state.options.providesTerrain === true
          ? (material) => !surfaces.isRenderedBuildingSurface(material)
          : false,
      mapStyleProjectionBlend:
        state.options.providesTerrain === true ? "overlay" : undefined,
      mapStyleProjectionVersion: appearance.mapStyleProjectionVersion,
      onAdd: lifecycle.onAdd,
      update: lifecycle.update,
      dispose: lifecycle.dispose,
      hasRenderableContent: lifecycle.hasRenderableContent,
      setErrorTarget: loading.setErrorTarget,
      setCacheBudget: loading.setCacheBudget,
      getRequestDemand: loading.getRequestDemand,
      setShadowSimulationStyle: appearance.setShadowSimulationStyle,
      setShadowView: shadows.setShadowView,
      isShadowRegionReady: shadows.isShadowRegionReady,
      getShadowRegionRevision: shadows.getShadowRegionRevision,
      getShadowRegionDiagnostics: shadows.getShadowRegionDiagnostics,
      isMainViewReady: spatial.isMainViewReady,
      getViewElevationRange: spatial.getViewElevationRange,
      getActiveTileVolumes: spatial.getActiveTileVolumes,
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
      setCacheBudget: loading.setCacheBudget,
      setRequestConcurrency: loading.setRequestConcurrency,
      getRequestDemand: loading.getRequestDemand,
    },
    placement: {
      originMerc: state.originMerc,
      mScale: state.mScale,
      setHeightOffset: lifecycle.setHeightOffset,
    },
    debug: {
      setTileBoundsVisible: debug.setTileBoundsVisible,
    },
  };
}
