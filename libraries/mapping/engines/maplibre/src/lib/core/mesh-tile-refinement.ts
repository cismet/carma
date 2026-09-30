import type { Tile } from "3d-tiles-renderer/core";
import {
  LOADED,
  isLoadedMesh,
  isMeshTileUnconditionallyRefined,
} from "./mesh-tile-coverage";
import { initialMeshLoadError } from "./mesh-error-policy";

/** Loaded external JSON and unconditional nodes are routing volumes.
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
    tile.internal?.hasUnrenderableContent &&
    tile.internal.loadingState !== LOADED
  )
    return true;
  const routing =
    isMeshTileUnconditionallyRefined(tile) ||
    tile.internal?.hasUnrenderableContent;
  if (!routing || !tile.children?.length) return true;
  return tile.children.some((child) =>
    hasMeshRefinementContentInView(child, inView)
  );
};

/**
 * Apply the local error and ancestor readiness constraints. The traversal
 * separately completes demanded sibling families before opening a deeper LOD.
 * Inspect only the nearest displayable parent: older ancestors may have had
 * their redundant payload evicted after their children replaced them.
 * The parent-first clause presumes the renderer loads ancestors; in the skip
 * strategy (`ancestorsLoaded` false) an intermediate level is never requested,
 * so missing ancestors must not block the next demanded family.
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
    // would otherwise stop at its parent. Missing siblings keep their demand.
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

/** Locate the immediate drawable replacement below a published surface.
 * Routing JSON and unconditional nodes do not count as LODs.
 */
export const isPublishedMeshRefinementLevel = (
  tile: Tile,
  published: ReadonlySet<Tile>
): boolean => {
  if (
    !tile.internal?.hasRenderableContent ||
    isMeshTileUnconditionallyRefined(tile)
  )
    return false;
  for (let parent = tile.parent; parent; parent = parent.parent) {
    if (
      !parent.internal?.hasRenderableContent ||
      isMeshTileUnconditionallyRefined(parent)
    )
      continue;
    return (
      parent.refine === "REPLACE" &&
      published.has(parent) &&
      isLoadedMesh(parent)
    );
  }
  return false;
};
