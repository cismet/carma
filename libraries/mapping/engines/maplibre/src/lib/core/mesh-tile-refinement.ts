import type { Tile } from "3d-tiles-renderer/core";
import {
  LOADED,
  isLoadedMesh,
  isMeshTileUnconditionallyRefined,
} from "./mesh-tile-coverage";
import { initialMeshLoadError } from "./mesh-error-policy";

/** Loaded external JSON is a routing volume, not missing display geometry.
 * Its loose box must not keep a finished view waiting when all real children
 * miss the camera. The caller treats unknown bounds as intersecting.
 */
export const hasMeshRefinementContentInView = (
  tile: Tile,
  inView: (tile: Tile) => boolean
): boolean => {
  if (!inView(tile)) return false;
  if (
    tile.internal?.hasContent === false &&
    !tile.internal.hasRenderableContent &&
    !tile.internal.hasUnrenderableContent &&
    !tile.children?.length
  )
    return false;
  if (
    !tile.internal?.hasUnrenderableContent ||
    tile.internal.loadingState !== LOADED ||
    !tile.children?.length
  )
    return true;
  return tile.children.some((child) =>
    hasMeshRefinementContentInView(child, inView)
  );
};

/**
 * Bootstrap to coarse coverage, then admit one generation below each ready
 * local fallback. A slow sibling elsewhere must not hold this branch at 16px.
 * Inspect only the nearest displayable parent: older ancestors may have had
 * their redundant payload evicted after their children replaced them.
 * The parent-first clause presumes the renderer loads ancestors; in the skip
 * strategy (`ancestorsLoaded` false) an intermediate level is never requested,
 * so refinement goes straight from the coarse pass to the target level.
 */
export const shouldDeferMeshRefinement = (
  tile: Tile,
  requestedError: number,
  errorPixels: (tile: Tile) => number = (tile) => tile.traversal.error,
  retainedAncestors: ReadonlySet<Tile> = new Set(),
  baseError?: number,
  ancestorsLoaded = true
): boolean => {
  for (let parent = tile.parent; parent; parent = parent.parent) {
    if (
      !parent.internal?.hasRenderableContent ||
      parent.refine !== "REPLACE" ||
      isMeshTileUnconditionallyRefined(parent)
    )
      continue;
    // Keep refining a retained finer branch even when a coarse admission target
    // would otherwise stop at its parent. The parent can still fill its holes.
    if (retainedAncestors.has(parent)) return false;
    const error = errorPixels(parent);
    return (
      error <= requestedError ||
      (ancestorsLoaded &&
        error <= initialMeshLoadError(requestedError, baseError) &&
        !isLoadedMesh(parent))
    );
  }
  return false;
};

/** Locate a drawable level below a published replacement surface. Routing
 * JSON and unconditional nodes do not count as LODs. Publication uses the
 * immediate level; request discovery may look further ahead without moving
 * that publication boundary.
 */
export const isPublishedMeshRefinementLevel = (
  tile: Tile,
  published: ReadonlySet<Tile>,
  minimumLevel = 1,
  maximumLevel = minimumLevel
): boolean => {
  if (
    !tile.internal?.hasRenderableContent ||
    isMeshTileUnconditionallyRefined(tile)
  )
    return false;
  let level = 0;
  for (let parent = tile.parent; parent; parent = parent.parent) {
    if (
      !parent.internal?.hasRenderableContent ||
      isMeshTileUnconditionallyRefined(parent)
    )
      continue;
    if (parent.refine !== "REPLACE") return false;
    level++;
    if (published.has(parent))
      return (
        level >= minimumLevel && level <= maximumLevel && isLoadedMesh(parent)
      );
    if (level >= maximumLevel) return false;
  }
  return false;
};
