import type { Tile } from "3d-tiles-renderer/core";
import {
  isLoadedMesh,
  getReadyMeshRegionCut,
  meshTileAncestors,
} from "./mesh-tile-coverage";

/**
 * Ancestors of the displayed cut below the extent floor: the
 * band a zoom-out step regresses through, kept resident by the runtime.
 */
export const collectResidentAncestors = (
  displayed: ReadonlySet<Tile>,
  extentGeometricError: number
): Set<Tile> => {
  const target = new Set<Tile>();
  for (const tile of displayed) {
    for (let parent = tile.parent; parent; parent = parent.parent) {
      if (target.has(parent) || parent.geometricError >= extentGeometricError)
        break;
      target.add(parent);
    }
  }
  return target;
};

/**
 * Atomic coarsening of a complete resident cut, including skipped generations
 * and non-quadtree REPLACE hierarchies. Error is judged against display demand.
 * The previous cut must be complete; loading/failed children are not coverage.
 */
export const canCoarsenMeshCut = (
  parent: Tile,
  previous: ReadonlySet<Tile>,
  requestedError: number,
  errorPixels: (tile: Tile) => number = (tile) => tile.traversal.error
): boolean =>
  parent.refine === "REPLACE" &&
  isLoadedMesh(parent) &&
  Number.isFinite(errorPixels(parent)) &&
  errorPixels(parent) <= requestedError &&
  getReadyMeshRegionCut(parent, previous, Number.MAX_VALUE, () => ({
    intersects: true,
    errorPixels: 0,
  })) !== null;

/** The ancestor closure of the retained cut, not a second tileset traversal.
 * Native REPLACE traversal must reach these branches even during a coarse
 * bootstrap pass. Only current camera SSE may release a complete cut;
 * traversal error can include a light camera or a relaxed admission target.
 */
export const getRetainedMeshAncestors = (
  previous: ReadonlySet<Tile>,
  requestedError: number,
  inView: (tile: Tile) => boolean,
  errorPixels: (tile: Tile) => number,
  allowInViewCoarsening = true
): Set<Tile> => {
  const retained = new Set<Tile>();
  const coarsenable = new Map<Tile, boolean>();
  for (const tile of previous) {
    if (!isLoadedMesh(tile) || !inView(tile)) continue;
    for (const parent of meshTileAncestors(tile)) {
      if (!coarsenable.has(parent))
        coarsenable.set(
          parent,
          allowInViewCoarsening &&
            canCoarsenMeshCut(parent, previous, requestedError, errorPixels)
        );
      if (parent.refine === "REPLACE" && !coarsenable.get(parent))
        retained.add(parent);
    }
  }
  return retained;
};
