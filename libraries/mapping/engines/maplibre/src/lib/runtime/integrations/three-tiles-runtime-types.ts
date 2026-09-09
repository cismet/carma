import { TilesRenderer } from "3d-tiles-renderer";
import { PriorityQueue, type Tile } from "3d-tiles-renderer/core";
import { MercatorCoordinate } from "maplibre-gl";
import * as THREE from "three";

import type { TextureColorCorrection } from "@carma-commons/resources";

import type { SharedThreeSceneRuntime } from "./shared-three-scene-layer";

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
  shadowLightFacing?: number;
  shadowReceiverCenterness?: number;
  shadowReceiverCurrent?: boolean;
  traversal: Tile["traversal"] & {
    unconditionallyRefine?: boolean;
    active?: boolean;
    wasSetActive?: boolean;
    wasSetVisible?: boolean;
  };
  engineData?: {
    scene?: THREE.Object3D;
    boundingVolume?: {
      getAABB: (target: THREE.Box3) => void;
      getOBB?: (bounds: THREE.Box3, transform: THREE.Matrix4) => void;
      getSphere: (target: THREE.Sphere) => void;
      intersectsFrustum: (frustum: THREE.Frustum) => boolean;
      distanceToPoint?: (point: THREE.Vector3) => number;
    };
  };
};

export type MeshTileDebugProgress = {
  discoveredAt: number;
  queuedAt?: number;
  loadedAt?: number;
  visibleAt?: number;
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
    setTileBoundsVisible: (enabled: boolean) => void;
  };
  readonly loading: {
    setErrorTarget: (errorTarget: number) => void;
    /**
     * Explicit resident cache budget (up to 24 GiB). No budget restores the
     * conservative device default; it is not an available-VRAM measurement.
     */
    setCacheBudget: (bytes?: number, options?: CacheBudgetOptions) => void;
    setRequestConcurrency: (jobs: number) => void;
    getRequestDemand: () => number;
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
  /** Restyle this tileset like a building layer while shadow mode is active. */
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
