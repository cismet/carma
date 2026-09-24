import type { Tile } from "3d-tiles-renderer/core";
import * as THREE from "three";

import type { createTileDrawObserver } from "./three-tiles-draw-observer";

import type { createThreeTilesRuntimeAttachment } from "./three-tiles-runtime-attachment";
import type { createThreeTilesCascade } from "./three-tiles-runtime-cascade";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import type { RuntimeTile } from "./three-tiles-runtime-types";

export type ThreeTilesFrameState = {
  retainedMeshAncestors: Set<Tile>;
  publishedContentRevision: number;
  telemetryTiles: Set<Tile>;
  telemetryDropped: number;
};

export type ThreeTilesFrameRuntimeState = Pick<
  ThreeTilesRuntimeState,
  | "allocationFailed"
  | "cameraSet"
  | "committedMeshCasterFrontier"
  | "committedMeshReceiverFrontier"
  | "currentToReference"
  | "displayedMeshFrontier"
  | "effectiveErrorTarget"
  | "extentFloorArmed"
  | "extentFloorAuditPending"
  | "extentFloorInView"
  | "extentFloorPending"
  | "extentGeometricError"
  | "lastLoadedViewportCutSize"
  | "lastMainViewConverged"
  | "lastRuntimeDebugAt"
  | "lastTraversalMs"
  | "loadingPaused"
  | "mainViewIntersectionCache"
  | "mainViewProjectionChanged"
  | "map"
  | "memoryAdmissionPaused"
  | "memoryErrorTarget"
  | "meshBaseCoverageReady"
  | "meshInitialHandoverDone"
  | "meshCoverageRecovery"
  | "meshContentRevision"
  | "meshDemandSweepPending"
  | "meshUnderlayFrontier"
  | "offsetGroup"
  | "options"
  | "orientationGroup"
  | "originLngLat"
  | "pendingShadowView"
  | "queuedThisTraversal"
  | "referenceToCurrent"
  | "requestedErrorTarget"
  | "residentAncestors"
  | "ringRefinePasses"
  | "runtimeVisible"
  | "shadowReceiverMask"
  | "shadowSelectionEnabled"
  | "shadowSelectionNeedsTraversal"
  | "shadowView"
  | "tileBoundsVisible"
  | "tileCameraDemand"
  | "tileCameraSignature"
  | "tileViewProjection"
  | "tiles"
  | "viewQualityAuditPasses"
>;

export type ThreeTilesFrameDependencies = Pick<
  ThreeTilesRuntimeServices,
  | "advanceMeshShadowCorridors"
  | "applyEffectiveErrorTarget"
  | "applyErrorTargetPolicy"
  | "applyRequestConcurrency"
  | "applyTilesetMinResolution"
  | "assignTilePriority"
  | "getTileCameraDemand"
  | "isTileNeededForMeshCoverage"
  | "getTileDebugProgress"
  | "recordTileWait"
  | "drainTileWaitEvents"
  | "beginTileWaitObservation"
  | "endTileWaitObservation"
  | "getTileRingIndex"
  | "getTileScreenError"
  | "invalidateShadowRegionRevisions"
  | "isTileInMainView"
  | "getTileObserverDemand"
  | "mainViewConverged"
  | "mainViewWithinErrorFactor"
  | "maybeEnableShadowSelection"
  | "maybeFinalizeShadowSelection"
  | "measureUsedBytesMain"
  | "notifyRequestStateChange"
  | "prepareViewFrustums"
  | "prioritizeQueuedTiles"
  | "readModelFrameBounds"
  | "recordCacheCeilingFailure"
  | "resetDeferredTiles"
  | "runDownloadQueues"
  | "scheduleSettledMeshAudit"
  | "sweepSettledMeshDemand"
  | "syncProjector"
  | "syncTileDebugOverlay"
>;

export type ThreeTilesFrameHooks = {
  frameState: ThreeTilesFrameState;
  attachment: ReturnType<typeof createThreeTilesRuntimeAttachment>;
  drawObserver: ReturnType<typeof createTileDrawObserver>;
  motionPrefetch: ReturnType<typeof createThreeTilesCascade>["motionPrefetch"];
  abortStaleDownloads: () => void;
  refineRingCascade: () => void;
  scheduleCascadeTick: () => void;
  isTileInAnyView: (tile: RuntimeTile) => boolean;
  localTelemetry: boolean;
  telemetryCenter: THREE.Vector3;
  telemetrySphere: THREE.Sphere;
};
