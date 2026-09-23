import { MAPLIBRE_EVENT } from "../../../constants/mapEvents";
import type {
  ThreeTilesRuntimeAttachmentDependencies,
  ThreeTilesRuntimeAttachmentState,
} from "./three-tiles-runtime-attachment";
import { debugTilesRuntimes } from "./three-tiles-runtime-debug";
import type { createThreeTilesPayloadQueues } from "./three-tiles-runtime-payload-queues";
import { disposeTilesRenderer } from "./three-tiles-runtime-vendor";
import type { TilesetDeferredMaterialsPlugin } from "./tileset-deferred-materials-plugin";

export function disposeThreeTilesAttachment(
  runtimeState: ThreeTilesRuntimeAttachmentState,
  dependencies: ThreeTilesRuntimeAttachmentDependencies,
  deferredMaterials: TilesetDeferredMaterialsPlugin,
  payloadQueues: ReturnType<typeof createThreeTilesPayloadQueues>
): void {
  runtimeState.disposed = true;
  deferredMaterials.dispose();
  payloadQueues.dispose();
  dependencies.clearTelemetry();
  if (runtimeState.meshAuditTimer !== null)
    clearTimeout(runtimeState.meshAuditTimer);
  runtimeState.meshAuditTimer = null;
  if (runtimeState.motionCoverageTimer !== null)
    clearTimeout(runtimeState.motionCoverageTimer);
  runtimeState.motionCoverageTimer = null;
  dependencies.clearErrorTargetTimer();
  dependencies.clearHiddenWipeTimer();
  dependencies.clearKickstartTimer();
  dependencies.resetDeferredTiles();
  if (runtimeState.requestBackoffTimer) {
    window.clearTimeout(runtimeState.requestBackoffTimer);
    runtimeState.requestBackoffTimer = 0;
  }
  runtimeState.map?.off(
    MAPLIBRE_EVENT.MOVE_START,
    dependencies.handleViewStart
  );
  runtimeState.map?.off(
    MAPLIBRE_EVENT.MOVE,
    dependencies.scheduleMotionCoverage
  );
  runtimeState.map?.off(MAPLIBRE_EVENT.MOVE_END, dependencies.handleViewEnd);
  runtimeState.map?.off(MAPLIBRE_EVENT.RESIZE, dependencies.handleViewEnd);
  runtimeState.map?.off(
    MAPLIBRE_EVENT.WEBGL_CONTEXT_LOST,
    dependencies.handleContextLost
  );
  runtimeState.map?.off(
    MAPLIBRE_EVENT.WEBGL_CONTEXT_RESTORED,
    dependencies.handleContextRestored
  );
  document.removeEventListener(
    "visibilitychange",
    dependencies.handleVisibilityChange
  );
  window.removeEventListener("pagehide", dependencies.endCacheCeilingSession);
  dependencies.endCacheCeilingSession();
  runtimeState.unsubscribeTerrainLoading?.();
  runtimeState.unsubscribeTerrainLoading = null;
  runtimeState.tiles?.removeEventListener(
    "needs-update",
    dependencies.requestRender
  );
  runtimeState.tiles?.removeEventListener(
    "load-tileset",
    dependencies.handleTilesetLoad
  );
  runtimeState.tiles?.removeEventListener(
    "update-after",
    dependencies.handleUpdateAfter
  );
  runtimeState.tiles?.removeEventListener(
    "load-model",
    dependencies.handleModelLoad
  );
  runtimeState.tiles?.removeEventListener(
    "tile-visibility-change",
    dependencies.handleTileVisibilityChange
  );
  runtimeState.tiles?.removeEventListener(
    "tile-download-start",
    dependencies.handleDownloadStart
  );
  runtimeState.tiles?.removeEventListener(
    "dispose-model",
    dependencies.handleModelDispose
  );
  runtimeState.tiles?.removeEventListener(
    "load-error",
    dependencies.handleLoadError
  );
  runtimeState.tiles?.removeEventListener(
    "tiles-load-end",
    dependencies.handleTilesLoadEnd
  );
  runtimeState.cameraSet?.dispose();
  runtimeState.cameraSet = null;
  runtimeState.tileRetries.dispose();
  // The material states are keyed by mesh, so release them directly
  // instead of searching the scene graph for their meshes.
  for (const [mesh, state] of runtimeState.clayMaterialStates) {
    dependencies.disposeClayState(mesh, state);
  }
  for (const [mesh, state] of runtimeState.litTextureMaterialStates) {
    dependencies.disposeLitTextureState(mesh, state);
  }
  dependencies.restoreShadowSides();
  runtimeState.tileDebugOverlay?.dispose();
  runtimeState.tileDebugOverlay = null;
  debugTilesRuntimes()?.delete(runtimeState);
  if (runtimeState.tiles) disposeTilesRenderer(runtimeState.tiles);
  runtimeState.tiles = null;
  runtimeState.meshRefinementSupport.clear();
  runtimeState.extentFloorArmed = false;
  runtimeState.extentFloorAuditPending = false;
  runtimeState.dracoLoader?.dispose();
  runtimeState.dracoLoader = null;
  runtimeState.orientationGroup.clear();
  runtimeState.map = null;
}
