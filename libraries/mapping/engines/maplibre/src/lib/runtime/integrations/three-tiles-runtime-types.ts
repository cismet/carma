import { TilesRenderer } from "3d-tiles-renderer";
import { PriorityQueue, type Tile } from "3d-tiles-renderer/core";
import { MercatorCoordinate } from "maplibre-gl";
import * as THREE from "three";

import type { TextureColorCorrection } from "@carma-commons/resources";
import type { MeshMercatorLut } from "@carma-geo/utils";

import type { SharedThreeSceneRuntime } from "../../core/shared-three-scene-types";
import type { ThreeTilesRuntimeCoverageStatus } from "./three-tiles-runtime-coverage";
import type { TilesRuntimeDebugState } from "../diagnostics/tile-diagnostic-state";
import type { TileDrawStatus } from "./three-tiles-draw-observer";

export type RuntimePriorityQueue = PriorityQueue & {
  items: Tile[];
  currJobs: number;
};

export type TileViewErrorTarget = {
  inView: boolean;
  error: number;
  distanceFromCamera: number;
};

export type RuntimeTile = Tile & {
  priority?: number;
  cameraPriority?: number;
  shadowLightFacing?: number;
  shadowReceiverCenterness?: number;
  shadowReceiverCurrent?: boolean;
  /** Admitted by the idle ring prefetch, outside the main view. */
  idleRing?: boolean;
  /** Single cancellable, spare-capacity zoom request; never a receiver demand. */
  zoomPrefetch?: boolean;
  /** Bounded future-view work, never part of the visible demand union. */
  motionPrefetch?: boolean;
  /** Request start; cleared by the first primary draw, not scene publication. */
  firstPublicationRequestedAt?: number;
  /** Ring the tile belongs to (1 = innermost), kept across moves until refreshed at rest. */
  idleRingIndex?: number;
  traversal: Tile["traversal"] & {
    unconditionallyRefine?: boolean;
    active?: boolean;
    wasSetActive?: boolean;
    wasSetVisible?: boolean;
  };
  engineData?: {
    scene?: THREE.Object3D;
    materials?: THREE.Material[];
    textures?: THREE.Texture[];
    boundingVolume?: {
      getAABB: (target: THREE.Box3) => void;
      getOBB?: (bounds: THREE.Box3, transform: THREE.Matrix4) => void;
      getSphere: (target: THREE.Sphere) => void;
      intersectsFrustum: (frustum: THREE.Frustum) => boolean;
      distanceToPoint?: (point: THREE.Vector3) => number;
    };
  };
};

export type MeshTileWait = {
  role: "receiver" | "shadow";
  reason:
    | "material"
    | "replacement-family"
    | "shadow-family"
    | "render"
    | "shadow-render"
    | "shadow-accumulation";
  since: number;
  until?: number;
  blocker?: string;
};

export type MeshTileDebugProgress = {
  /** Last 32 observed publication waits; roles have independent clocks. */
  waits?: MeshTileWait[];
  discoveredAt: number;
  queuedAt?: number;
  downloadStartedAt?: number;
  downloadFinishedAt?: number;
  parseStartedAt?: number;
  parseFinishedAt?: number;
  publicationStartedAt?: number;
  publicationFinishedAt?: number;
  lastError?: string;
  loadedAt?: number;
  visibleAt?: number;
  shadowDepthSubmittedAt?: number;
  shadowPresentedAt?: number;
  corridorReadyAt?: number;
  stableAt?: number;
  iterations: number;
  lastIterationFrame: number;
};

export type RuntimeTilesRenderer = TilesRenderer & {
  // Existing upstream methods omitted from its declaration file. Keep retained
  // mesh visibility and cache usage synchronized through the renderer itself.
  setTileActive: (tile: Tile, active: boolean) => void;
  setTileVisible: (tile: Tile, visible: boolean) => void;
  markTileUsed: (tile: Tile) => void;
  prepareForTraversal: () => void;
  calculateTileViewError: (tile: Tile, target: TileViewErrorTarget) => void;
  calculateBytesUsed: (
    tile: Tile,
    scene: THREE.Object3D | null
  ) => number | null;
  calculateTileViewErrorWithPlugin: (
    tile: Tile,
    target: TileViewErrorTarget
  ) => void;
  loadingTiles: Set<Tile>;
  usedSet: Set<Tile>;
  /** Incremented by every traversal that actually ran. */
  frameCount: number;
  stats: {
    failed: number;
    queued: number;
    downloading: number;
    parsing: number;
  };
  queueTileForDownload: (tile: Tile) => void;
  requestTileContents: (tile: Tile) => Promise<unknown> | undefined;
  ensureChildrenArePreprocessed: (tile: Tile, forceImmediate?: boolean) => void;
};

export type RuntimeLruCache = TilesRenderer["lruCache"] & {
  itemSet: Map<Tile, number>;
  itemList: Tile[];
  usedSet: Set<Tile>;
  cachedBytes: number;
};

/** Cesium 3D Tiles runtime for the shared local MapLibre Three.js scene. */
export type ImageProjector =
  | {
      kind: "pano";
      position: THREE.Vector3;
      headingRad: number;
      texture: THREE.Texture;
      opacity: number;
    }
  | {
      kind: "frustum";
      viewProj: THREE.Matrix4;
      texture: THREE.Texture;
      opacity: number;
    };

export interface ThreeTilesRuntime {
  /** Stable engine adapter; register this object with the shared scene. */
  readonly scene: SharedThreeSceneRuntime & {
    onAdd: NonNullable<SharedThreeSceneRuntime["onAdd"]>;
    setShadowView: NonNullable<SharedThreeSceneRuntime["setShadowView"]>;
    isMainViewReady: () => boolean;
    getViewElevationRange: NonNullable<
      SharedThreeSceneRuntime["getViewElevationRange"]
    >;
  };
  readonly appearance: {
    setVisible: (visible: boolean) => void;
    /** Override textures with physically lit clay shading (reversible). */
    setWhiteShading: (white: boolean) => void;
    setClayMaterial: (options: ClayMaterialOptions) => void;
    setClayColor: (color: string) => void;
    setOpacity: (opacity: number) => void;
    setWireframe: (enabled: boolean) => void;
    setOutlineVisible: (visible: boolean) => void;
    /** Restyle loaded outlines and the ones parsed from now on. */
    setOutlineStyle: (style: OutlineStyleOptions) => void;
    setProjector: (projector: ImageProjector | null) => void;
  };
  readonly debug: {
    /** Read-only, live diagnostic view. Never serialize its Three.js objects to workers. */
    readState: () => Readonly<TilesRuntimeDebugState> | undefined;
    setDiagnosticsEnabled: (enabled: boolean) => void;
    setTelemetryEnabled: (enabled: boolean) => void;
    setTileBoundsVisible: (enabled: boolean) => void;
  };
  readonly loading: {
    /** Final/idle target, with an optional coarser initial view target. */
    setErrorTarget: (errorTarget: number, initialErrorTarget?: number) => void;
    /**
     * A consumer's target on top of the host's, the shadow simulation's
     * tileset LOD for instance; null returns to the host's target.
     */
    setErrorTargetOverride: (errorTarget: number | null) => void;
    /** The host's target without any override. */
    getErrorTarget: () => number;
    /**
     * Explicit resident cache budget (up to 24 GiB). No budget restores the
     * conservative device default; it is not an available-VRAM measurement.
     */
    setCacheBudget: (bytes?: number, options?: CacheBudgetOptions) => void;
    setRequestConcurrency: (jobs: number) => void;
    getRequestDemand: () => number;
    /** Hold downloads and parsing without aborting anything (diagnostics). */
    setPaused: (paused: boolean) => void;
    /** Foveated request order: 0 nearest first, higher favours the view centre. */
    setFoveation: (weight: number) => void;
    /** Residual quality as pixels across the extent; null restores the hinted floor. */
    setTilesetMinResolution: (px: number | null) => void;
    /** Parse jobs at rest (GLTF scene creation on the renderer thread). */
    setParseConcurrency: (jobs: number) => void;
    /** The memory-adaptive error target currently in force (see TILES_COVERAGE.md). */
    getMemoryErrorTarget: () => number;
    /**
     * Observed source-floor diagnostics. This does not certify complete
     * renderable coverage for every registered camera.
     */
    getCoverageStatus: () => ThreeTilesRuntimeCoverageStatus;
    /** Actual WebGL draw submissions; does not prove unoccluded screen pixels. */
    getDrawStatus: () => TileDrawStatus;
  };
  readonly placement: {
    setHeightOffset: (offsetMeters: number) => void;
    originMerc: MercatorCoordinate;
    mScale: number;
  };
}

export interface ClayMaterialOptions {
  color?: string;
  roughness?: number;
  metalness?: number;
}

export interface OutlineStyleOptions {
  color?: THREE.ColorRepresentation;
  opacity?: number;
}

export interface CacheBudgetOptions {
  /** Bytes the style allows beyond its budget before downloads pause. */
  overflowBytes?: number;
}

export interface ThreeTilesRuntimeOptions {
  /** Opt-in local ECEF reprojection during native parse, including tile bounds.
   * Not global support; source geometry must fall inside the LUT domain. */
  mercatorProjection?: MeshMercatorLut;
  /** Optional worker-backed static hierarchy cache; false uses native JSON loading. */
  hierarchyCache?: boolean;
  /** Persist the learned resident cache ceiling in localStorage (hosts, not tests). */
  persistCacheCeiling?: boolean;
  /** Bounded pipeline console samples; false disables collection/reporting. */
  tileTelemetry?: boolean;
  /** Dataset metadata; absent means identity, never a dataset-specific fallback. */
  colorCorrection?: TextureColorCorrection;
  cacheBudgetBytes?: number;
  /** Bytes allowed beyond the eviction budget before downloads pause. */
  cacheOverflowBytes?: number;
  requestConcurrency?: number;
  onRequestStateChange?: () => void;
  onContentChanged?: (
    changedBounds?: readonly THREE.Box3[],
    changedRoots?: readonly THREE.Object3D[]
  ) => void;
  outline?: boolean;
  outlineColor?: THREE.ColorRepresentation;
  outlineOpacity?: number;
  /** The tileset includes the ground surface represented by terrain. */
  providesTerrain?: boolean;
  /**
   * Refit the tileset at the current camera target each time the map centre
   * moves, instead of keeping the fixed mount the tileset was built at.
   */
  cameraLocalMount?: boolean;
  /**
   * How the map style meets a terrain-providing tileset: `labels` overlays the
   * point labels (default), `none` leaves the tileset untouched.
   */
  mapStyleDrape?: "labels" | "none";
  /**
   * Known ground height at the layer origin, in metres: the tileset is
   * lowered by it from the first traversal on. Preferred over the probe,
   * which can only run once the first tiles under the origin have arrived.
   */
  selfGroundReference?: boolean;
  groundReferenceMeters?: number;
  /**
   * Residency and warm-up hints published with the style, see
   * `TilesetEntryHint`: the whole extent stays resident down to at least the
   * hinted level, and the listed hierarchy files are warmed on init.
   */
  entry?: TilesetEntryHint;
  /**
   * First-pass error target in pixels for a terrain-providing tileset. When
   * the style declares it, that coarse pass is the fallback while the target
   * level loads and the renderer skips the intermediate ancestors, the way
   * Cesium's skipLevelOfDetail does; undeclared keeps the renderer's
   * ancestor fallback together with the default first pass.
   */
  baseErrorTargetPixels?: number;
  /** Optional cold first-image request target in renderer pixels. */
  firstImageErrorTargetPixels?: number;
  /** Complete the initial viewport at this error before idle/reserve work. */
  handoverErrorTargetPixels?: number;
  /**
   * Diagnostics: register the runtime state in `window.__carmaTiles3d` and keep
   * the per-traversal bookkeeping the diagnostics story reads. Off by default;
   * the story reports its own overhead against this.
   */
  diagnostics?: boolean;
  /**
   * Restyle this tileset like a building layer while shadow mode is active.
   * Off, colour and opacity stay as declared by the style, while unlit
   * materials still receive the lighting adapter needed for shadows.
   * Outlines always follow their declared visibility.
   */
  shadowBuildingStyle?: boolean;
}

export type ClayMaterialState = {
  original: THREE.Material | THREE.Material[];
  clay: THREE.Material | THREE.Material[];
};

export type LitTextureMaterialState = {
  original: THREE.Material | THREE.Material[];
  lit: THREE.Material | THREE.Material[];
  generated: THREE.Material[];
};

/**
 * Hints published with the style for a tileset whose hierarchy is a chain of
 * external files: the geometric error and payload bytes per level, which size
 * how deep the whole extent may stay resident within the memory share, and
 * the hierarchy files to warm on init so the traversal finds them in the
 * hierarchy cache instead of walking the chain.
 */
export type TilesetEntryHint = {
  levels: Array<{
    level: number;
    geometricError: number;
    bytes: number;
  }>;
  prefetch?: string[];
};
