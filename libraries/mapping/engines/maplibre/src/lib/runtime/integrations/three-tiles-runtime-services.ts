import type { Tile } from "3d-tiles-renderer/core";
import type { Map as MaplibreMap } from "maplibre-gl";
import type * as THREE from "three";

import type { ShadowReceiverMask } from "../../core/shadow-receiver-mask";
import type {
  SharedThreeSceneFrame,
  SharedThreeSceneShadowStyle,
  SharedThreeSceneTileVolume,
} from "../../core/shared-three-scene-types";
import type { createTileCameraDemand } from "../../core/tile-camera-demand";
import type {
  CacheBudgetOptions,
  ClayMaterialOptions,
  ClayMaterialState,
  ImageProjector,
  LitTextureMaterialState,
  MeshTileDebugProgress,
  MeshTileRequestDecision,
  OutlineStyleOptions,
  RuntimeLruCache,
  RuntimePriorityQueue,
  RuntimeTile,
} from "./three-tiles-runtime-types";

export interface ThreeTilesRuntimeServices {
  initialEffectiveErrorTarget: () => number;
  shadowStylesEqual: (
    first: SharedThreeSceneShadowStyle | null,
    second: SharedThreeSceneShadowStyle | null
  ) => boolean;
  /** Model bounds in the runtime's frame space (see `frameFromTiles`). */
  readModelFrameBounds: (
    model: THREE.Object3D,
    target: THREE.Box3
  ) => THREE.Box3;
  /** Refresh and return `frameFromTiles` from the static root chain. */
  updateFrameFromTiles: () => THREE.Matrix4;
  patchMaterialForProjection: (material: THREE.Material) => void;
  isSeparatedBuildingSurface: (material: THREE.Material) => boolean;
  isRenderedBuildingSurface: (material: THREE.Material) => boolean;
  resolveRenderSide: (material: THREE.Material) => THREE.Side;
  asMaterialArray: (
    material: THREE.Material | THREE.Material[]
  ) => THREE.Material[];
  normalizeSeparatedBuildingSurfaces: (root: THREE.Object3D) => void;
  buildClayMaterial: (source: THREE.Material) => THREE.MeshStandardMaterial;
  buildLitTextureMaterial: (source: THREE.Material) => THREE.Material;
  disposeClayState: (mesh: THREE.Mesh, state: ClayMaterialState) => void;
  restoreClayMaterials: (root: THREE.Object3D) => void;
  disposeLitTextureState: (
    mesh: THREE.Mesh,
    state: LitTextureMaterialState
  ) => void;
  restoreLitTextureMaterials: (root: THREE.Object3D) => void;
  applyShadowCastingSide: (material: THREE.Material) => void;
  restoreShadowSides: () => void;
  applyMaterialFlags: (root: THREE.Object3D) => void;
  refreshRenderedMaterials: (root: THREE.Object3D) => void;
  applyOutlineVisibility: (root: THREE.Object3D) => void;
  applyOutlineStyle: (root: THREE.Object3D) => void;
  requestRender: () => void | undefined;
  getDownloadQueues: () => RuntimePriorityQueue[];
  runDownloadQueues: () => void;
  clearErrorTargetTimer: () => void;
  clearKickstartTimer: () => void;
  clearHiddenWipeTimer: () => void;
  getRuntimeCache: () => RuntimeLruCache | null;
  getRequestDemand: () => number;
  getViewElevationRange: (
    camera: THREE.Camera
  ) => readonly [number, number] | null;
  getActiveTileVolumes: () => readonly SharedThreeSceneTileVolume[];
  notifyRequestStateChange: () => void;
  clearShadowReceiverSources: () => void;
  setShadowSelectionEnabled: (enabled: boolean) => void;
  requestShadowSelectionRefresh: () => void;
  isPipelineIdle: () => boolean;
  isTileInMainView: (tile: RuntimeTile) => boolean;
  getTileObserverDemand: (
    tile: RuntimeTile,
    includeVisibleArea?: boolean
  ) => {
    intersects: boolean;
    errorPixels: number;
    visibleAreaPixels?: number;
  };
  getTileCameraDemand: (
    tile: RuntimeTile,
    includeObserver?: boolean
  ) => ReturnType<ReturnType<typeof createTileCameraDemand>["evaluate"]>;
  getTileRequestPriority: (tile: RuntimeTile) => number;
  isTileNeededForMeshCoverage: (tile: Tile) => boolean;
  isChildUnloadable: (child: RuntimeTile) => boolean;
  mainViewWithinErrorFactor: (
    factor: number,
    allowBlocked?: boolean,
    frontier?: ReadonlySet<Tile> | undefined
  ) => boolean;
  mainViewConverged: () => boolean;
  currentShadowPathConverged: () => boolean;
  getTileCenterness: (
    bounds: NonNullable<RuntimeTile["engineData"]>["boundingVolume"]
  ) => number;
  getTileDebugId: (tile: Tile) => string;
  getTileDebugProgress: (tile: Tile) => MeshTileDebugProgress;
  recordTileRequestDecision: (
    tile: Tile,
    decision: MeshTileRequestDecision
  ) => void;
  recordTileWait: (
    tile: Tile,
    role: "receiver" | "shadow",
    reason:
      | NonNullable<MeshTileDebugProgress["waits"]>[number]["reason"]
      | null,
    blocker?: Tile
  ) => void;
  drainTileWaitEvents: () => readonly unknown[];
  beginTileWaitObservation: () => void;
  endTileWaitObservation: () => void;
  recordTileIteration: (tile: Tile) => void;
  formatDebugDuration: (milliseconds: number | undefined) => string;
  getStableTileId: (tile: Tile) => string;
  getTileScreenError: (tile: RuntimeTile, includeShadow?: boolean) => number;
  updateRootWorldBounds: () => boolean;
  shadowRegionKey: (
    bounds: THREE.Box3,
    errorPixels: number,
    receiverBounds?: THREE.Box3
  ) => string;
  invalidateShadowRegionRevisions: (
    changedBounds?: readonly THREE.Box3[]
  ) => void;
  getShadowRegionRevision: (
    bounds: THREE.Box3,
    errorPixels?: number,
    receiverBounds?: THREE.Box3
  ) => string | null;
  peekShadowRegionRevision: (
    bounds: THREE.Box3,
    errorPixels: number,
    receiverBounds?: THREE.Box3
  ) => string | null;
  getTileLoadReason: (
    tile: RuntimeTile
  ) => SharedThreeSceneTileVolume["loadReason"];
  createReceiverSnapshot: (frontier: ReadonlySet<Tile>) => {
    signature: string;
    mask: ShadowReceiverMask | null;
    sourceTiles: Set<Tile>;
  } | null;
  captureShadowReceiverSources: () => "empty" | "unchanged" | "updated";
  measureUsedBytesMain: () => void;
  applyEffectiveErrorTarget: (nextTarget: number) => void;
  resetEffectiveErrorTarget: () => void;
  applyErrorTargetPolicy: () => void;
  resetDeferredTiles: () => void;
  evictUnusedCacheItems: () => void;
  wipeCacheWhileHidden: () => void;
  handleVisibilityChange: () => void;
  maybeEnableShadowSelection: () => void;
  isRequiredMeshTile: (tile: RuntimeTile) => boolean;
  sweepSettledMeshDemand: () => void;
  scheduleSettledMeshAudit: () => void;
  maybeFinalizeShadowSelection: () => void;
  advanceMeshShadowCorridors: (
    viewportTiles: ReadonlySet<Tile>,
    traversalTiles: ReadonlySet<Tile>
  ) => void;
  handleTileVisibilityChange: (event: { tile: Tile; visible: boolean }) => void;
  handleModelLoad: (event: {
    scene?: THREE.Object3D;
    tile?: Tile;
    url?: string;
  }) => void;
  handleModelDispose: (event: { scene?: THREE.Object3D; tile?: Tile }) => void;
  handleTilesetLoad: (event: { url?: string }) => void;
  handleLoadError: (event: {
    tile?: Tile | null;
    url?: string | URL;
    error?: unknown;
  }) => void;
  handleTilesLoadEnd: () => void;
  syncProjector: () => void;
  applyCacheBudget: () => void;
  reapplyCacheBoundsIfDrifted: () => void;
  sampleMemoryPressure: () => void;
  handleContextLost: () => void;
  /** Learn a lower resident ceiling from a failure and apply it at once. */
  recordCacheCeilingFailure: (reason: "allocation" | "context-lost") => void;
  /** Mark the session clean (page hide or dispose); lets a lesson recover. */
  endCacheCeilingSession: () => void;
  handleContextRestored: () => void;
  applyRequestConcurrency: () => void;
  applyTilesetMinResolution: () => void;
  handleWireBytes: (_url: string, response: Response) => void;
  scheduleRequestBackoffRecovery: () => void;
  handleViewStart: () => void;
  scheduleMotionCoverage: () => void;
  handleViewEnd: () => void;
  prepareViewFrustums: (viewCamera: THREE.Camera) => void;
  isTileInPrefetchMargin: (tile: RuntimeTile) => boolean;
  /** Innermost idle ring the tile intersects (1-based); the ring after the last frustum is the whole model. 0 only without bounds. */
  getTileRingIndex: (tile: RuntimeTile) => number;
  applyTileDeferral: (tile: Tile, inView: boolean) => void;
  assignTilePriority: (tile: RuntimeTile) => void;
  prioritizeQueuedTiles: () => void;
  syncTileDebugOverlay: () => void;
  handleUpdateAfter: () => void;
  mapStyleProjectionVersion: () => number;
  onAdd: (mapInstance: MaplibreMap) => void;
  update: (frame: SharedThreeSceneFrame) => void;
  setVisible: (visible: boolean) => void;
  setHeightOffset: (offsetMeters: number) => void;
  setErrorTarget: (errorTarget: number, initialErrorTarget?: number) => void;
  setErrorTargetOverride: (errorTarget: number | null) => void;
  getErrorTarget: () => number;
  setShadowSimulationStyle: (
    style: Readonly<{
      fullOpacity: boolean;
      uniformColor: string | null;
      uniformColorMix?: number;
      textureSaturation?: number;
      textureColorCorrection?: boolean;
    }> | null
  ) => void;
  setProjector: (projector: ImageProjector | null) => void;
  /** Apply the view kept back by setShadowView during the initial base pass. */
  applyPendingShadowView: () => void;
  setShadowView: (
    view: Readonly<{
      camera: THREE.Camera;
      /** Unit direction to the sun in ECEF; keys caster selection when present. */
      directionToSunECEF?: readonly [number, number, number];
      casterAngularRadiusRadians?: number;
      shadowMapSize: Readonly<{ width: number; height: number }>;
    }> | null
  ) => void;
  setWhiteShading: (white: boolean) => void;
  setClayMaterial: (options: ClayMaterialOptions) => void;
  setClayColor: (color: string) => void;
  setOpacity: (nextOpacity: number) => void;
  setWireframe: (enabled: boolean) => void;
  setOutlineVisible: (visible: boolean) => void;
  setOutlineStyle: (style: OutlineStyleOptions) => void;
  setTileBoundsVisible: (enabled: boolean) => void;
  setCacheBudget: (bytes?: number, cacheOptions?: CacheBudgetOptions) => void;
  setRequestConcurrency: (jobs: number) => void;
  isShadowRegionReady: (
    bounds: THREE.Box3,
    errorPixels: number | undefined,
    receiverBounds: THREE.Box3 | undefined
  ) => boolean;
  getShadowRegionDiagnostics: (
    bounds: THREE.Box3,
    errorPixels: number | undefined,
    receiverBounds: THREE.Box3 | undefined
  ) => Readonly<{
    sourceId: string;
    ready: boolean;
    errorPixels: number;
    visitedNodes: number;
    broadPhaseNodes: number;
    rejectedPrismNodes: number;
    receiverPrismTested: boolean;
    selectedTileIds: readonly string[];
  }> | null;
  isMainViewReady: () => boolean;
  hasRenderableContent: () => false;
  dispose: () => void;
}
