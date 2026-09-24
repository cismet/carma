import type { Tile } from "3d-tiles-renderer/core";
import {
  isLoadedMesh,
  getReadyMeshRegionCut,
  isMeshCoverageRemovalSafe,
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

/**
 * Preserve the already displayed mesh cut when upstream falls back to a
 * coarse REPLACE ancestor while a sibling is missing. New regions/refinement
 * use the progressive selection. Ancestors may coexist with finer children
 * as depth-free underlays until the current-view branches are all covered.
 * Published offscreen coverage remains part of the cut until the proposed cut
 * contains a loaded ancestor or complete loaded descendant replacement. This
 * lets sparse motion traversals move without turning resident history blank.
 */
export const retainMeshDetailFrontier = ({
  previous,
  proposed,
  requestedError,
  inView,
  errorPixels = (tile) => tile.traversal.error,
  acceptsOffscreenFallback = () => true,
  allowInViewCoarsening = true,
}: {
  previous: ReadonlySet<Tile>;
  proposed: ReadonlySet<Tile>;
  requestedError: number;
  inView: (tile: Tile) => boolean;
  errorPixels?: (tile: Tile) => number;
  /** Distance-dependent reserve demand; do not collapse the fringe to the root. */
  acceptsOffscreenFallback?: (tile: Tile) => boolean;
  /** Motion admission may fill new regions without downgrading visible detail. */
  allowInViewCoarsening?: boolean;
}): Set<Tile> => {
  const result = new Set(proposed);
  const rejected = new Set<Tile>();
  // Decision: COVERAGE-DIAGNOSTIC-WORK-20260914 in TILES_COVERAGE.md.
  // Index this cut once. Re-scanning every proposal for each retained tile's
  // ancestors made ordinary camera motion quadratic in the resident history.
  const visibility = new Map<Tile, boolean>();
  const intersectsView = (tile: Tile): boolean => {
    if (!visibility.has(tile)) visibility.set(tile, inView(tile));
    return visibility.get(tile)!;
  };
  const inViewProposedAncestors = new Set<Tile>();
  const descendants = new Map<Tile, Set<Tile>>();
  const indexResult = (tile: Tile) => {
    for (let parent = tile.parent; parent; parent = parent.parent) {
      let indexed = descendants.get(parent);
      if (!indexed) descendants.set(parent, (indexed = new Set()));
      indexed.add(tile);
    }
  };
  const addResult = (tile: Tile) => {
    if (result.has(tile)) return;
    result.add(tile);
    indexResult(tile);
  };
  const removeDescendants = (ancestor: Tile) => {
    for (const tile of descendants.get(ancestor) ?? []) result.delete(tile);
  };
  for (const tile of proposed) {
    indexResult(tile);
    if (!intersectsView(tile)) continue;
    for (let node: Tile | null = tile; node; node = node.parent) {
      if (inViewProposedAncestors.has(node)) break;
      inViewProposedAncestors.add(node);
    }
  }
  const previousCoverage = new Map<Tile, boolean>();
  const coarsenable = new Map<Tile, boolean>();
  const previouslyCovered = (tile: Tile) => {
    if (!previousCoverage.has(tile))
      previousCoverage.set(
        tile,
        getReadyMeshRegionCut(
          tile,
          previous,
          Number.MAX_VALUE,
          (candidate) => ({
            intersects: !candidate.traversal || intersectsView(candidate),
            errorPixels: 0,
          })
        ) !== null
      );
    return previousCoverage.get(tile)!;
  };
  for (const tile of previous) {
    if (!isLoadedMesh(tile) || !intersectsView(tile)) continue;
    for (const parent of meshTileAncestors(tile)) {
      if (proposed.has(parent) && !coarsenable.has(parent))
        coarsenable.set(
          parent,
          allowInViewCoarsening &&
            canCoarsenMeshCut(parent, previous, requestedError, errorPixels)
        );
      if (
        parent.refine === "REPLACE" &&
        proposed.has(parent) &&
        !coarsenable.get(parent) &&
        !descendants.has(parent) &&
        // Preserve fine detail only when it actually covers the current view.
        // Rejecting a ready parent above a partial old cut leaves permanent
        // holes after a pan. Coverage takes precedence over retained detail.
        previouslyCovered(parent)
      ) {
        rejected.add(parent);
      }
    }
  }
  for (const parent of rejected) result.delete(parent);
  const offscreenAcceptance = new Map<Tile, boolean>();
  const getLoadedOffscreenFallback = (tile: Tile): Tile | null => {
    let fallback: Tile | null = null;
    for (const parent of meshTileAncestors(tile)) {
      if (
        parent.refine === "REPLACE" &&
        isLoadedMesh(parent) &&
        !intersectsView(parent) &&
        !inViewProposedAncestors.has(parent)
      ) {
        if (!offscreenAcceptance.has(parent))
          offscreenAcceptance.set(parent, acceptsOffscreenFallback(parent));
        if (offscreenAcceptance.get(parent)) fallback = parent;
      }
    }
    return fallback;
  };
  for (const tile of previous) {
    if (!isLoadedMesh(tile)) continue;
    // Keep the whole previous family under a rejected ancestor, including
    // its fringe, rather than introduce holes at the viewport boundary.
    const parents = [...meshTileAncestors(tile)];
    if (parents.some((parent) => rejected.has(parent))) {
      addResult(tile);
      continue;
    }
    if (
      intersectsView(tile) &&
      parents.some((parent) => result.has(parent) && !coarsenable.get(parent))
    ) {
      addResult(tile);
      continue;
    }
    if (result.has(tile) || isMeshCoverageRemovalSafe(tile, result)) continue;
    // Publication and eviction have different domains. A complete current-view
    // child cut may replace the coarse draw without refining offscreen siblings.
    // Keep physical removal governed by isMeshCoverageRemovalSafe (whole extent),
    // so the resident ancestor still covers later pans. Unknown bounds fail closed.
    if (
      intersectsView(tile) &&
      getReadyMeshRegionCut(tile, result, Number.MAX_VALUE, (candidate) => ({
        intersects:
          !candidate.internal ||
          !candidate.traversal ||
          intersectsView(candidate),
        errorPixels: 0,
      })) !== null
    )
      continue;
    // Pressure may coarsen a wholly offscreen historical family without waiting
    // for native traversal to propose it. LOADED proves parsed renderable scene
    // content, though deferred texture promotion may still finish before a later
    // pan makes this fallback visible. Never load an ancestor from this helper.
    const offscreenFallback = !intersectsView(tile)
      ? getLoadedOffscreenFallback(tile)
      : null;
    if (offscreenFallback) {
      removeDescendants(offscreenFallback);
      addResult(offscreenFallback);
      continue;
    }
    // Preserve coverage while retaining independently ready descendants.
    // The draw pass marks overlapping parents as depth-free underlays.
    addResult(tile);
  }
  return result;
};
