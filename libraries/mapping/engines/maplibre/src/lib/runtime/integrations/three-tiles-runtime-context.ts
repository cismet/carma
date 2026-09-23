import { type Tile } from "3d-tiles-renderer/core";
import type { CacheCeilingMemory } from "./three-tiles-cache-ceiling-memory";
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
} from "../../core/shared-three-scene-types";
import type { createThreeTilesDebugOverlay } from "./three-tiles-debug-overlay";
import type { EffectiveErrorTargetState } from "../../core/effective-error-target";
import { createTileBytesPredictor } from "./three-tiles-byte-prediction";
import { resolveTilesCacheCeiling } from "../../core/tile-cache-policy";
import { createThreeTilesRetryController } from "./three-tiles-retry-controller";
import type {
  ClayMaterialState,
  ImageProjector,
  LitTextureMaterialState,
  MeshTileDebugProgress,
  RuntimeTilesRenderer,
  ThreeTilesRuntimeOptions,
} from "./three-tiles-runtime-types";
import {
  TilesViewFrustum,
  readTilesDeviceProfile,
} from "./three-tiles-runtime-vendor";
import type { TilesCameraSet } from "./tiles-camera-set";
import type { createTileCameraDemand } from "../../core/tile-camera-demand";

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
  tileCameraDemand: ReturnType<typeof createTileCameraDemand>;
  tileCameraSignature: string;
  kickstartTimer: number;
  requestBackoffTimer: number;
  hiddenWipeTimer: number;
  disposed: boolean;
  lastTraversalFrameCount: number;
  unsubscribeTerrainLoading: (() => void) | null;
  requestedErrorTarget: number;
  /** The host's target; requestedErrorTarget applies the override on top of it. */
  configuredErrorTarget: number;
  errorTargetOverride: number | null;
  effectiveErrorTarget: number;
  errorTargetState: EffectiveErrorTargetState;
  errorTargetTimer: number;
  lastProgressAt: number;
  usedBytesMain: number;
  lastMainViewConverged: boolean;
  deviceProfile: ReturnType<typeof readTilesDeviceProfile>;
  /** Learned resident ceiling and the session probe, persisted by the host. */
  cacheCeilingStorage: Storage | null;
  cacheCeilingMemory: CacheCeilingMemory | null;
  learnedCeilingBytes: number | null;
  cacheCeilingPeakWrittenAt: number;
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
  /** Host-requested pause of downloads and parsing (diagnostics); nothing is aborted. */
  loadingPaused: boolean;
  /** The public runtime handle, for diagnostics that hold only the state. */
  hostHandle: unknown;
  /**
   * Memory-adaptive error target: raised above the requested target while the
   * cache is at its ceiling with an unconverged view, lowered again when
   * memory frees. Never above the base error target.
   */
  memoryErrorTarget: number;
  memoryErrorTargetChangedAt: number;
  /** Foveated request order, 0 = nearest first (see TilePriorityInput.foveationWeight). */
  foveationWeight: number;
  /** Residual quality as a resolution across the extent; null keeps the hinted floor. */
  tilesetMinResolutionPx: number | null;
  /** The residual resolution the current floor was resolved for. */
  appliedTilesetMinResolutionPx: number | null;
  /** The cache ceiling the current floor was resolved for. */
  appliedTilesetMinCeilingBytes: number;
  /** Longest axis of the root's oriented box, known once the root is loaded. */
  rootLongestAxisMeters: number;
  allocationFailed: boolean;
  contextLost: boolean;
  meshAuditTimer: ReturnType<typeof setTimeout> | null;
  motionCoverageTimer: ReturnType<typeof setTimeout> | null;
  meshDemandSweepPending: boolean;
  /** Sibling payloads/materials needed to replace the published cut without gaps. */
  meshRefinementSupport: Set<Tile>;
  meshBaseCoverageReady: boolean;
  /** Current observer has uncovered branches beside an already published cut. */
  meshCoverageRecovery: boolean;
  /** Startup reserve pass completed or yielded to a capacity/source limit. */
  meshInitialReserveSettled: boolean;
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
  /** The add-on's view while a terrain-providing runtime's initial base pass runs. */
  pendingShadowView: SharedThreeSceneShadowView | null;
  /** The initial view cut and the whole-extent reserve were complete once. */
  meshInitialBasePassDone: boolean;
  /** Observer handover reached at rest; enables normal offscreen family completion. */
  meshInitialHandoverDone: boolean;
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
  /** Loaded parents drawn under the displayed cut where in-view children are missing. */
  meshUnderlayFrontier: Set<Tile>;
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
  ringFrustums: TilesViewFrustum[];
  /** Levels by which the ring cascade has been refined below its coarse start. */
  ringRefinePasses: number;
  /** Geometric error of the level the whole extent stays resident at (Infinity: none). */
  extentGeometricError: number;
  /** Set once the first base coverage exists; from then on the extent floor is always admitted. */
  extentFloorArmed: boolean;
  /** Refinement waits until an armed traversal has accounted for the floor. */
  extentFloorAuditPending: boolean;
  /** Floor tiles the last traversal found not loaded; refinement waits for zero. */
  extentFloorPending: number;
  /** Floor tiles in the main view during the last traversal: always underlay candidates. */
  extentFloorInView: Set<Tile>;
  /**
   * Ancestors of the displayed cut down to the floor: loaded at rest and kept
   * used while their descendants are displayed, so a zoom-out step always
   * finds the immediate parent resident and the error regresses one level
   * at a time instead of falling to the floor underlay.
   */
  residentAncestors: Set<Tile>;
  lastRingRefineAt: number;
  /** Wall time of the last renderer traversal, the frame-cost guard for refinement. */
  lastTraversalMs: number;
  viewFrustumsReady: boolean;
  tileBoundingSphere: THREE.Sphere;
  tileBoundingBox: THREE.Box3;
  tileBoundsTransform: THREE.Matrix4;
  modelLocalBounds: WeakMap<THREE.Object3D, THREE.Box3>;
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
  frameFromTiles: THREE.Matrix4;
  frameToShadowView: THREE.Matrix4;
  referenceToCurrent: THREE.Matrix4;
  currentToReference: THREE.Matrix4;
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
  /** Bumped by every group-wide restyle; tile scenes carry the stamp they were styled at. */
  materialRevision: number;
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

export type { ThreeTilesRuntimeServices } from "./three-tiles-runtime-services";
