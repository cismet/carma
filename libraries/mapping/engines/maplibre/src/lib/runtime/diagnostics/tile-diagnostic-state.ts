import type { MeshTileDebugProgress } from "../integrations/three-tiles-runtime-types";
import type { Tile } from "3d-tiles-renderer/core";
import type { TilesRenderer } from "3d-tiles-renderer";
import * as THREE from "three";
import type { Kind } from "../../core/diagnostics/tile-diagnostic-model";
import type { createTileCameraDemand } from "../../core/tile-camera-demand";
const LOADED = 4;
export type RuntimeTile = Tile & { idleRing?: boolean };

/** The slice of the runtime state the overlay reads, see three-tiles-runtime-context.ts. */
export type TilesRuntimeDebugState = {
  tileDebugProgress?: WeakMap<Tile, MeshTileDebugProgress>;
  tileCameraDemand: ReturnType<typeof createTileCameraDemand>;
  tiles: TilesRenderer | null;
  displayedMeshFrontier: ReadonlySet<Tile>;
  meshUnderlayFrontier: ReadonlySet<Tile>;
  extentGeometricError: number;
  extentFloorPending: number;
  effectiveErrorTarget: number;
  requestedErrorTarget: number;
  meshBaseCoverageReady: boolean;
  meshContentRevision: number;
  memoryAdmissionPaused: boolean;
  loadingPaused: boolean;
  memoryErrorTarget: number;
  ceilingBytes: number;
  lastTraversalMs: number;
  deferred: ReadonlySet<Tile>;
  viewFrustumsReady?: boolean;
  tileViewFrustum?: THREE.Frustum;
  mainViewIntersectionCache?: WeakMap<Tile, boolean>;
};

export const isLoadedMesh = (tile: Tile): boolean =>
  tile.internal?.hasRenderableContent === true &&
  tile.internal.loadingState === LOADED;

export const collectFloorLeaves = (root: Tile, extentError: number): Tile[] => {
  const out: Tile[] = [];
  const walk = (tile: Tile) => {
    if (!tile.internal) return;
    const children = tile.children ?? [];
    if (
      tile.geometricError >= extentError &&
      children.every((child) => child.geometricError < extentError)
    ) {
      out.push(tile);
      return;
    }
    for (const child of children) walk(child);
  };
  walk(root);
  return out;
};

const obbBox = new THREE.Box3();
const obbMatrix = new THREE.Matrix4();
const obbCorner = new THREE.Vector3();

/**
 * World-space bounds of a tile, fitted from the eight corners of its oriented
 * box. The axis-aligned box the renderer offers is aligned with the tileset's
 * ECEF axes; rotated into the local frame it is inflated in every direction,
 * most of all in height, which is what the plane footprints depend on.
 */
export const tileWorldBox = (
  tile: Tile,
  group: THREE.Object3D,
  target: THREE.Box3
): THREE.Box3 | null => {
  // The three.js renderer attaches the bounding volume under engineData.
  const volume = (
    tile as unknown as {
      engineData?: {
        boundingVolume?: {
          getAABB?: (box: THREE.Box3) => void;
          getOBB?: (box: THREE.Box3, matrix: THREE.Matrix4) => void;
        };
      };
    }
  ).engineData?.boundingVolume;
  if (!volume) return null;
  if (volume.getOBB) {
    volume.getOBB(obbBox, obbMatrix);
    if (obbBox.isEmpty()) return null;
    obbMatrix.premultiply(group.matrixWorld);
    target.makeEmpty();
    for (let index = 0; index < 8; index += 1) {
      obbCorner.set(
        index & 1 ? obbBox.max.x : obbBox.min.x,
        index & 2 ? obbBox.max.y : obbBox.min.y,
        index & 4 ? obbBox.max.z : obbBox.min.z
      );
      target.expandByPoint(obbCorner.applyMatrix4(obbMatrix));
    }
    return target;
  }
  if (!volume.getAABB) return null;
  volume.getAABB(target);
  if (target.isEmpty()) return null;
  return target.applyMatrix4(group.matrixWorld);
};

/** Tiles with a request in flight: queued, downloading or parsing. */
export const loadingTilesOf = (tiles: TilesRenderer): ReadonlySet<Tile> =>
  (tiles as unknown as { loadingTiles: ReadonlySet<Tile> }).loadingTiles;

export const tileId = (tile: Tile): string => {
  const uri = (tile as { content?: { uri?: string } }).content?.uri ?? "";
  const base = uri.split("/").pop() ?? "";
  return base.replace(/\.[a-z0-9]+$/i, "").replace(/^mesh_/, "");
};

export const tileError = (tile: Tile): number =>
  (tile.traversal as { error?: number } | undefined)?.error ?? Number.NaN;

/** Levels of refinement between the tile's screen error and the target. */
export const levelsToTarget = (error: number, target: number): number =>
  Number.isFinite(error) && error > target
    ? Math.ceil(Math.log2(error / target))
    : 0;

export const kindOf = (
  tile: Tile,
  state: TilesRuntimeDebugState,
  floor: ReadonlySet<Tile>
): Kind | null => {
  const loadingState = tile.internal?.loadingState ?? 0;
  if (state.displayedMeshFrontier.has(tile)) return "displayed";
  if (state.meshUnderlayFrontier.has(tile)) return "underlay";
  if (loadingState === LOADED) {
    if (floor.has(tile)) return "floor";
    if ((tile as RuntimeTile).idleRing) return "ring";
    return "resident";
  }
  if (loadingState === 1) return "queued";
  if (loadingState === 2) return "loading";
  if (loadingState === 3) return "parsing";
  if (state.deferred.has(tile)) return "deferred";
  if (loadingState === -1) return "failed";
  return null;
};
