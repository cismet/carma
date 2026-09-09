import { TilesRenderer } from "3d-tiles-renderer";
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
  SharedThreeSceneShadowStyle,
  SharedThreeSceneShadowView,
  SharedThreeShadowRegionDiagnostics,
} from "./shared-three-scene-layer";
import { createThreeTilesDebugOverlay } from "./three-tiles-debug-overlay";
import type { EffectiveErrorTargetState } from "./three-tiles-load-policy";
import {
  createEffectiveErrorTargetState,
  createTileBytesPredictor,
  initialMeshLoadError,
  resolveTilesCacheCeiling,
} from "./three-tiles-load-policy";
import {
  createThreeTilesRetryController,
  type RetryableTilesRenderer,
} from "./three-tiles-retry-controller";
import type { ThreeTilesRuntimeState } from "./three-tiles-runtime-context";
import type {
  ClayMaterialState,
  ImageProjector,
  LitTextureMaterialState,
  MeshTileDebugProgress,
  RuntimeTilesRenderer,
  ThreeTilesRuntimeOptions,
} from "./three-tiles-runtime-types";
import {
  CLAY_COLOR,
  THREE_TILES_DEFAULT_REQUEST_CONCURRENCY,
  TILES_ERROR_TARGET_DEFAULT_PIXELS,
} from "./three-tiles-runtime-config";
import {
  TilesViewFrustum,
  readTilesDeviceProfile,
} from "./three-tiles-runtime-vendor";
import type { TilesCameraSet } from "./tiles-camera-set";

export function createThreeTilesRuntimeState(
  layerId: string,
  tilesetUrl: string,
  originLngLat: [number, number],
  options: ThreeTilesRuntimeOptions
): ThreeTilesRuntimeState {
  const originMerc = MercatorCoordinate.fromLngLat(originLngLat, 0);
  const mScale = originMerc.meterInMercatorCoordinateUnits();
  const map: MaplibreMap | null = null;
  const tiles: RuntimeTilesRenderer | null = null;
  const dracoLoader: DRACOLoader | null = null;
  const tileDebugOverlay: ReturnType<
    typeof createThreeTilesDebugOverlay
  > | null = null;
  const cameraSet: TilesCameraSet | null = null;
  const kickstartTimer = 0;
  const requestBackoffTimer = 0;
  const hiddenWipeTimer = 0;
  const disposed = false;
  const lastTraversalFrameCount = -1;
  const unsubscribeTerrainLoading: (() => void) | null = null;
  const requestedErrorTarget = TILES_ERROR_TARGET_DEFAULT_PIXELS;
  const effectiveErrorTarget = options.providesTerrain
    ? initialMeshLoadError(requestedErrorTarget)
    : requestedErrorTarget;
  const errorTargetState: EffectiveErrorTargetState = {
    ...createEffectiveErrorTargetState(requestedErrorTarget, Date.now()),
    effective: effectiveErrorTarget,
  };
  const errorTargetTimer = 0;
  const lastProgressAt = 0;
  const usedBytesMain = 0;
  const lastMainViewConverged = false;
  const deviceProfile = readTilesDeviceProfile();
  const styleCacheBudgetBytes = options.cacheBudgetBytes;
  const styleCacheOverflowBytes = options.cacheOverflowBytes;
  const ceilingBytes = resolveTilesCacheCeiling(deviceProfile, {
    cacheBudgetBytes: styleCacheBudgetBytes,
    cacheOverflowBytes: styleCacheOverflowBytes,
  });
  const bytesPredictor = createTileBytesPredictor();
  /** Displayable siblings outside the view and its prefetch margin (D1). */
  const deferred = new Set<Tile>();
  const queuedThisTraversal = new Set<Tile>();
  const requestConcurrency = Math.max(
    0,
    Math.floor(
      options.requestConcurrency ?? THREE_TILES_DEFAULT_REQUEST_CONCURRENCY
    )
  );
  const payloadAwareConcurrency = createPayloadAwareRequestConcurrency();
  const memoryAdmissionPaused = false;
  const allocationFailed = false;
  const contextLost = false;
  const meshAuditTimer: ReturnType<typeof setTimeout> | null = null;
  const motionCoverageTimer: ReturnType<typeof setTimeout> | null = null;
  const motionCoverageDue = false;
  const meshBaseCoverageReady = false;
  const meshDemandSweepPending = options.providesTerrain === true;
  const lastMemoryCheck = Number.NEGATIVE_INFINITY;
  const normalParseConcurrency: number | null = null;
  // ReorientationPlugin produces X west / Z north. The MapLibre custom-layer
  // matrix below and the other pointcloud layers use X east / Z south, so keep
  // the plugin-owned group untouched and correct the horizontal axes in a
  // persistent parent (the plugin updates tiles.group asynchronously).
  const orientationGroup = new THREE.Group();
  orientationGroup.rotation.y = Math.PI;
  const offsetGroup = new THREE.Group();
  orientationGroup.add(offsetGroup);
  const whiteShading = false;
  const clayColor = new THREE.Color(CLAY_COLOR);
  const clayRoughness = 0.92;
  const clayMetalness = 0;
  const opacity = 1;
  const wireframe = false;
  const outlineVisible = options.outline ?? true;
  const outlineColor: THREE.ColorRepresentation =
    options.outlineColor ?? 0x000000;
  const outlineOpacity = clamp(options.outlineOpacity ?? 1, 0, 1);
  const shadowSimulationStyle: SharedThreeSceneShadowStyle | null = null;
  const shadowView: SharedThreeSceneShadowView | null = null;
  const shadowViewSignature = "";
  const shadowSelectionEnabled = false;
  const shadowSelectionNeedsTraversal = false;
  const shadowSelectionRefreshPending = false;
  const shadowReceiverMask: ShadowReceiverMask | null = null;
  const shadowReceiverMaskConverged = false;
  const shadowReceiverSourceSignature = "";
  const pendingMeshReceiverFrontier: Set<Tile> | null = null;
  const committedMeshReceiverFrontier = new Set<Tile>();
  const committedMeshCasterFrontier = new Set<Tile>();
  const displayedMeshFrontier = new Set<Tile>();
  const meshContentRevision = 0;
  const mainViewSourceTiles = new Set<Tile>();
  const viewQualityAuditPasses = 0;
  const shadowClayColor = new THREE.Color(CLAY_COLOR);
  const tileBoundsVisible = true;
  const tileDebugIds = new WeakMap<Tile, number>();
  const nextTileDebugId = 1;
  const tileDebugProgress = new WeakMap<Tile, MeshTileDebugProgress>();
  const tileDebugOverlayUpdatedAt = Number.NEGATIVE_INFINITY;
  const lastRuntimeDebugAt = Number.NEGATIVE_INFINITY;
  const lastLoadedViewportCutSize = 0;
  const runtimeVisible = true;
  const activeProjector: ImageProjector | null = null;
  const placementMatrix = new THREE.Matrix4();
  const inversePlacementMatrix = new THREE.Matrix4();
  const tileViewProjection = new THREE.Matrix4();
  const tileViewFrustum = new TilesViewFrustum();
  const marginCamera = new THREE.PerspectiveCamera();
  const marginProjection = new THREE.Matrix4();
  const marginFrustum = new TilesViewFrustum();
  const viewFrustumsReady = false;
  const tileBoundingSphere = new THREE.Sphere();
  const tileBoundingBox = new THREE.Box3();
  const tileBoundsTransform = new THREE.Matrix4();
  const modelWorldBounds = new WeakMap<
    THREE.Object3D,
    { rootMatrixWorld: THREE.Matrix4; bounds: THREE.Box3 }
  >();
  const rootBoundsTransform = new THREE.Matrix4();
  const sourceWorldBoundsTransform = new THREE.Matrix4();
  const activeTileBoundingBox = new THREE.Box3();
  const rootTileBoundingBox = new THREE.Box3();
  const rootWorldBoundingBox = new THREE.Box3();
  const sourceWorldBoundingBox = new THREE.Box3();
  const tileViewElevationFrustum = new THREE.Frustum();
  const tileViewElevationProjection = new THREE.Matrix4();
  const tileProjectedCenter = new THREE.Vector3();
  const tilesToShadowView = new THREE.Matrix4();
  const sunwardDirection = new THREE.Vector3();
  const shadowSignatureDirection = new THREE.Vector3();
  const shadowReceiverMatch: ShadowReceiverMatch = {
    receiverGeometricError: Number.POSITIVE_INFINITY,
    receiverCenterness: 0,
    lightFacing: 0,
  };
  const identityRotation = new THREE.Quaternion();
  const projectorUniforms = {
    uProjKind: { value: 0 },
    uProjOpacity: { value: 0 },
    uProjPos: { value: new THREE.Vector3() },
    uProjHeading: { value: 0 },
    uProjMatrix: { value: new THREE.Matrix4() },
    tProj: { value: null as THREE.Texture | null },
  };
  const shadowAppearanceUniforms = {
    uShadowUniformColor: { value: shadowClayColor },
    uShadowUniformColorMix: { value: 0 },
    uShadowTextureSaturation: { value: 1 },
    uShadowTextureColorCorrection: { value: false },
    uShadowTextureGamma: {
      value: new THREE.Vector3().fromArray(
        options.colorCorrection?.gamma ?? [1, 1, 1]
      ),
    },
    uShadowTextureBlackPoint: {
      value: new THREE.Vector3().fromArray(
        options.colorCorrection?.blackPoint ?? [0, 0, 0]
      ),
    },
    uShadowTextureWhitePoint: {
      value: new THREE.Vector3().fromArray(
        options.colorCorrection?.whitePoint ?? [1, 1, 1]
      ),
    },
  };
  const clayMaterialStates = new Map<THREE.Mesh, ClayMaterialState>();
  const litTextureMaterialStates = new Map<
    THREE.Mesh,
    LitTextureMaterialState
  >();
  const originalShadowSides = new Map<THREE.Material, THREE.Side | null>();
  const originalRenderSides = new Map<THREE.Material, THREE.Side>();
  const separatedSurfaceRenderSides = new WeakMap<THREE.Material, THREE.Side>();
  const mapStyleProjectionVersion = 0;
  const normalizedSeparatedSurfaceGeometries =
    new WeakSet<THREE.BufferGeometry>();
  const tileRetries = createThreeTilesRetryController(
    () =>
      state.tiles as unknown as (TilesRenderer & RetryableTilesRenderer) | null,
    () => state.map?.triggerRepaint()
  );
  const lastNotifiedRequestDemand = Number.NaN;
  const mainViewIntersectionCache = new WeakMap<Tile, boolean>();
  const lastMainViewProjection = new THREE.Matrix4();
  const mainViewProjectionChanged = true;
  const shadowRegionRevisions = new Map<
    string,
    {
      revision: string | null;
      diagnostics: SharedThreeShadowRegionDiagnostics;
      queryBounds: THREE.Box3;
    }
  >();
  const shadowRegionWorldBounds = new WeakMap<
    Tile,
    {
      box: THREE.Box3;
      transform: THREE.Matrix4;
      worldBounds: THREE.Box3;
    }
  >();
  const shadowRegionTransform = new THREE.Matrix4();
  const state: ThreeTilesRuntimeState = {
    originMerc,
    mScale,
    map,
    tiles,
    dracoLoader,
    tileDebugOverlay,
    cameraSet,
    kickstartTimer,
    requestBackoffTimer,
    hiddenWipeTimer,
    disposed,
    lastTraversalFrameCount,
    unsubscribeTerrainLoading,
    requestedErrorTarget,
    effectiveErrorTarget,
    errorTargetState,
    errorTargetTimer,
    lastProgressAt,
    usedBytesMain,
    lastMainViewConverged,
    deviceProfile,
    styleCacheBudgetBytes,
    styleCacheOverflowBytes,
    ceilingBytes,
    bytesPredictor,
    deferred,
    queuedThisTraversal,
    requestConcurrency,
    payloadAwareConcurrency,
    memoryAdmissionPaused,
    allocationFailed,
    contextLost,
    meshAuditTimer,
    motionCoverageTimer,
    motionCoverageDue,
    meshBaseCoverageReady,
    meshDemandSweepPending,
    lastMemoryCheck,
    normalParseConcurrency,
    orientationGroup,
    offsetGroup,
    whiteShading,
    clayColor,
    clayRoughness,
    clayMetalness,
    opacity,
    wireframe,
    outlineVisible,
    outlineColor,
    outlineOpacity,
    shadowSimulationStyle,
    shadowView,
    shadowViewSignature,
    shadowSelectionEnabled,
    shadowSelectionNeedsTraversal,
    shadowSelectionRefreshPending,
    shadowReceiverMask,
    shadowReceiverMaskConverged,
    shadowReceiverSourceSignature,
    pendingMeshReceiverFrontier,
    committedMeshReceiverFrontier,
    committedMeshCasterFrontier,
    displayedMeshFrontier,
    meshContentRevision,
    mainViewSourceTiles,
    viewQualityAuditPasses,
    shadowClayColor,
    tileBoundsVisible,
    tileDebugIds,
    nextTileDebugId,
    tileDebugProgress,
    tileDebugOverlayUpdatedAt,
    lastRuntimeDebugAt,
    lastLoadedViewportCutSize,
    runtimeVisible,
    activeProjector,
    placementMatrix,
    inversePlacementMatrix,
    tileViewProjection,
    tileViewFrustum,
    marginCamera,
    marginProjection,
    marginFrustum,
    viewFrustumsReady,
    tileBoundingSphere,
    tileBoundingBox,
    tileBoundsTransform,
    modelWorldBounds,
    rootBoundsTransform,
    sourceWorldBoundsTransform,
    activeTileBoundingBox,
    rootTileBoundingBox,
    rootWorldBoundingBox,
    sourceWorldBoundingBox,
    tileViewElevationFrustum,
    tileViewElevationProjection,
    tileProjectedCenter,
    tilesToShadowView,
    sunwardDirection,
    shadowSignatureDirection,
    shadowReceiverMatch,
    identityRotation,
    projectorUniforms,
    shadowAppearanceUniforms,
    clayMaterialStates,
    litTextureMaterialStates,
    originalShadowSides,
    originalRenderSides,
    separatedSurfaceRenderSides,
    mapStyleProjectionVersion,
    normalizedSeparatedSurfaceGeometries,
    tileRetries,
    lastNotifiedRequestDemand,
    mainViewIntersectionCache,
    lastMainViewProjection,
    mainViewProjectionChanged,
    shadowRegionRevisions,
    shadowRegionWorldBounds,
    shadowRegionTransform,
    layerId,
    tilesetUrl,
    originLngLat,
    options,
  };
  return state;
}
