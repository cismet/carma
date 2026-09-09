import { type Tile } from "3d-tiles-renderer/core";
import type { Map as MaplibreMap } from "maplibre-gl";
import { MercatorCoordinate } from "maplibre-gl";
import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

import { clamp } from "@carma-commons/math";

import {
  type ShadowReceiverMask,
  type ShadowReceiverMatch,
} from "../../core/shadow-receiver-mask";
import { createPayloadAwareRequestConcurrency } from "./payload-aware-request-concurrency";
import type {
  SharedThreeSceneFrame,
  SharedThreeSceneShadowStyle,
  SharedThreeSceneShadowView,
  SharedThreeSceneTileVolume,
  SharedThreeShadowRegionDiagnostics,
} from "./shared-three-scene-layer";
import { createThreeTilesDebugOverlay } from "./three-tiles-debug-overlay";
import type { EffectiveErrorTargetState } from "./three-tiles-load-policy";
import {
  createTileBytesPredictor,
  resolveTilesCacheCeiling,
} from "./three-tiles-load-policy";
import { createThreeTilesRetryController } from "./three-tiles-retry-controller";
import type {
  CacheBudgetOptions,
  ClayMaterialOptions,
  ClayMaterialState,
  ImageProjector,
  LitTextureMaterialState,
  MeshTileDebugProgress,
  OutlineStyleOptions,
  RuntimeLruCache,
  RuntimePriorityQueue,
  RuntimeTile,
  RuntimeTilesRenderer,
  ThreeTilesRuntimeOptions,
} from "./three-tiles-runtime-types";
import {
  TilesViewFrustum,
  readTilesDeviceProfile,
} from "./three-tiles-runtime-vendor";
import type { TilesCameraSet } from "./tiles-camera-set";

export interface ThreeTilesRuntimeState {
  layerId: string;
  tilesetUrl: string;
  originLngLat: [number, number];
  options: ThreeTilesRuntimeOptions;
  originMerc: MercatorCoordinate;
  mScale: number;
  map: MaplibreMap | null;
  tiles: RuntimeTilesRenderer | null;
  dracoLoader: DRACOLoader | null;
  tileDebugOverlay: ReturnType<typeof createThreeTilesDebugOverlay> | null;
  cameraSet: TilesCameraSet | null;
  kickstartTimer: number;
  requestBackoffTimer: number;
  hiddenWipeTimer: number;
  disposed: boolean;
  lastTraversalFrameCount: number;
  unsubscribeTerrainLoading: (() => void) | null;
  requestedErrorTarget: number;
  effectiveErrorTarget: number;
  errorTargetState: EffectiveErrorTargetState;
  errorTargetTimer: number;
  lastProgressAt: number;
  usedBytesMain: number;
  lastMainViewConverged: boolean;
  deviceProfile: ReturnType<typeof readTilesDeviceProfile>;
  styleCacheBudgetBytes: number | undefined;
  styleCacheOverflowBytes: number | undefined;
  ceilingBytes: ReturnType<typeof resolveTilesCacheCeiling>;
  bytesPredictor: ReturnType<typeof createTileBytesPredictor>;
  deferred: Set<Tile>;
  queuedThisTraversal: Set<Tile>;
  requestConcurrency: number;
  payloadAwareConcurrency: ReturnType<
    typeof createPayloadAwareRequestConcurrency
  >;
  memoryAdmissionPaused: boolean;
  allocationFailed: boolean;
  contextLost: boolean;
  meshAuditTimer: ReturnType<typeof setTimeout> | null;
  motionCoverageTimer: ReturnType<typeof setTimeout> | null;
  motionCoverageDue: boolean;
  meshDemandSweepPending: boolean;
  lastMemoryCheck: number;
  normalParseConcurrency: number | null;
  orientationGroup: THREE.Group<THREE.Object3DEventMap>;
  offsetGroup: THREE.Group<THREE.Object3DEventMap>;
  whiteShading: boolean;
  clayColor: THREE.Color;
  clayRoughness: number;
  clayMetalness: number;
  opacity: number;
  wireframe: boolean;
  outlineVisible: boolean;
  outlineColor: THREE.ColorRepresentation;
  outlineOpacity: ReturnType<typeof clamp>;
  shadowSimulationStyle: SharedThreeSceneShadowStyle | null;
  shadowView: SharedThreeSceneShadowView | null;
  shadowViewSignature: string;
  shadowSelectionEnabled: boolean;
  shadowSelectionNeedsTraversal: boolean;
  shadowSelectionRefreshPending: boolean;
  shadowReceiverMask: ShadowReceiverMask | null;
  shadowReceiverMaskConverged: boolean;
  shadowReceiverSourceSignature: string;
  pendingMeshReceiverFrontier: Set<Tile> | null;
  committedMeshReceiverFrontier: Set<Tile>;
  committedMeshCasterFrontier: Set<Tile>;
  displayedMeshFrontier: Set<Tile>;
  meshContentRevision: number;
  mainViewSourceTiles: Set<Tile>;
  viewQualityAuditPasses: number;
  shadowClayColor: THREE.Color;
  tileBoundsVisible: boolean;
  tileDebugIds: WeakMap<Tile, number>;
  nextTileDebugId: number;
  tileDebugProgress: WeakMap<Tile, MeshTileDebugProgress>;
  tileDebugOverlayUpdatedAt: number;
  lastRuntimeDebugAt: number;
  lastLoadedViewportCutSize: number;
  runtimeVisible: boolean;
  activeProjector: ImageProjector | null;
  placementMatrix: THREE.Matrix4;
  inversePlacementMatrix: THREE.Matrix4;
  tileViewProjection: THREE.Matrix4;
  tileViewFrustum: TilesViewFrustum;
  marginCamera: THREE.PerspectiveCamera;
  marginProjection: THREE.Matrix4;
  marginFrustum: TilesViewFrustum;
  viewFrustumsReady: boolean;
  tileBoundingSphere: THREE.Sphere;
  tileBoundingBox: THREE.Box3;
  tileBoundsTransform: THREE.Matrix4;
  modelWorldBounds: WeakMap<
    THREE.Object3D<THREE.Object3DEventMap>,
    { rootMatrixWorld: THREE.Matrix4; bounds: THREE.Box3 }
  >;
  rootBoundsTransform: THREE.Matrix4;
  sourceWorldBoundsTransform: THREE.Matrix4;
  activeTileBoundingBox: THREE.Box3;
  rootTileBoundingBox: THREE.Box3;
  rootWorldBoundingBox: THREE.Box3;
  sourceWorldBoundingBox: THREE.Box3;
  tileViewElevationFrustum: THREE.Frustum;
  tileViewElevationProjection: THREE.Matrix4;
  tileProjectedCenter: THREE.Vector3;
  tilesToShadowView: THREE.Matrix4;
  sunwardDirection: THREE.Vector3;
  shadowSignatureDirection: THREE.Vector3;
  shadowReceiverMatch: ShadowReceiverMatch;
  identityRotation: THREE.Quaternion;
  projectorUniforms: {
    uProjKind: { value: number };
    uProjOpacity: { value: number };
    uProjPos: { value: THREE.Vector3 };
    uProjHeading: { value: number };
    uProjMatrix: { value: THREE.Matrix4 };
    tProj: { value: THREE.Texture | null };
  };
  shadowAppearanceUniforms: {
    uShadowUniformColor: { value: THREE.Color };
    uShadowUniformColorMix: { value: number };
    uShadowTextureSaturation: { value: number };
    uShadowTextureColorCorrection: { value: boolean };
    uShadowTextureGamma: { value: THREE.Vector3 };
    uShadowTextureBlackPoint: { value: THREE.Vector3 };
    uShadowTextureWhitePoint: { value: THREE.Vector3 };
  };
  clayMaterialStates: Map<
    THREE.Mesh<
      THREE.BufferGeometry<
        THREE.NormalBufferAttributes,
        THREE.BufferGeometryEventMap
      >,
      THREE.Material | THREE.Material[],
      THREE.Object3DEventMap
    >,
    ClayMaterialState
  >;
  litTextureMaterialStates: Map<
    THREE.Mesh<
      THREE.BufferGeometry<
        THREE.NormalBufferAttributes,
        THREE.BufferGeometryEventMap
      >,
      THREE.Material | THREE.Material[],
      THREE.Object3DEventMap
    >,
    LitTextureMaterialState
  >;
  originalShadowSides: Map<THREE.Material, THREE.Side | null>;
  originalRenderSides: Map<THREE.Material, THREE.Side>;
  separatedSurfaceRenderSides: WeakMap<THREE.Material, THREE.Side>;
  mapStyleProjectionVersion: number;
  normalizedSeparatedSurfaceGeometries: WeakSet<
    THREE.BufferGeometry<
      THREE.NormalBufferAttributes,
      THREE.BufferGeometryEventMap
    >
  >;
  tileRetries: ReturnType<typeof createThreeTilesRetryController>;
  lastNotifiedRequestDemand: number;
  mainViewIntersectionCache: WeakMap<Tile, boolean>;
  lastMainViewProjection: THREE.Matrix4;
  mainViewProjectionChanged: boolean;
  shadowRegionRevisions: Map<
    string,
    {
      revision: string | null;
      diagnostics: SharedThreeShadowRegionDiagnostics;
      queryBounds: THREE.Box3;
    }
  >;
  shadowRegionWorldBounds: WeakMap<
    Tile,
    { box: THREE.Box3; transform: THREE.Matrix4; worldBounds: THREE.Box3 }
  >;
  shadowRegionTransform: THREE.Matrix4;
}

export interface ThreeTilesRuntimeServices {
  initialEffectiveErrorTarget: () => number;
  shadowStylesEqual: (
    first: SharedThreeSceneShadowStyle | null,
    second: SharedThreeSceneShadowStyle | null
  ) => boolean;
  readModelWorldBounds: (
    model: THREE.Object3D,
    target: THREE.Box3
  ) => THREE.Box3;
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
  recordTileIteration: (tile: Tile) => void;
  formatDebugDuration: (milliseconds: number | undefined) => string;
  getStableTileId: (tile: Tile) => string;
  getTileScreenError: (tile: RuntimeTile) => number;
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
  handleContextRestored: () => void;
  applyRequestConcurrency: () => void;
  handleWireBytes: (_url: string, response: Response) => void;
  scheduleRequestBackoffRecovery: () => void;
  handleViewStart: () => void;
  scheduleMotionCoverage: () => void;
  handleViewEnd: () => void;
  prepareViewFrustums: (viewCamera: THREE.Camera) => void;
  isTileInPrefetchMargin: (tile: RuntimeTile) => boolean;
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
  setErrorTarget: (errorTarget: number) => void;
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
  setShadowView: (
    view: Readonly<{
      camera: THREE.Camera;
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
