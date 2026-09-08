import type { Tile } from "3d-tiles-renderer/core";

// Upstream's allChildrenLoaded also accepts FAILED. It is not a coverage proof.
const LOADED = 4;
const isLoadedMesh = (tile: Tile): boolean =>
  tile.internal?.hasRenderableContent && tile.internal.loadingState === LOADED;

/** A hidden parent payload is redundant only with real, drawn child coverage. */
export const isMeshCoveredByLoadedChildren = (
  tile: Tile,
  visible: ReadonlySet<Tile>
): boolean =>
  tile.refine === "REPLACE" &&
  !tile.internal?.hasUnrenderableContent &&
  !visible.has(tile) &&
  (tile.children?.length ?? 0) > 0 &&
  tile.children!.every((child) => visible.has(child) && isLoadedMesh(child));

const ancestors = function* (tile: Tile): Generator<Tile> {
  for (let parent = tile.parent; parent; parent = parent.parent) yield parent;
};

/**
 * A single, atomic quadtree coarsening, judged against the requested display
 * error, never the progressive download admission error. Unknown / failed /
 * external content and skipped generations deliberately fail closed.
 */
export const canCoarsenMeshQuartet = (
  parent: Tile,
  previous: ReadonlySet<Tile>,
  requestedError: number
): boolean =>
  parent.refine === "REPLACE" &&
  isLoadedMesh(parent) &&
  Number.isFinite(parent.traversal.error) &&
  parent.traversal.error <= requestedError &&
  parent.children?.length === 4 &&
  parent.children.every(
    (child) =>
      child.parent === parent && previous.has(child) && isLoadedMesh(child)
  );

/**
 * Preserve the already displayed mesh cut when upstream falls back to a
 * coarse REPLACE ancestor while a sibling is missing. New regions/refinement
 * still use upstream selection. No ancestor and descendant are returned
 * together in a REPLACE family, so retaining detail cannot create a second surface.
 * Only the current visible cut is retained, not a history of camera views.
 */
export const retainMeshDetailFrontier = ({
  previous,
  proposed,
  requestedError,
  inView,
}: {
  previous: ReadonlySet<Tile>;
  proposed: ReadonlySet<Tile>;
  requestedError: number;
  inView: (tile: Tile) => boolean;
}): Set<Tile> => {
  const result = new Set(proposed);
  const rejected = new Set<Tile>();
  const refined = new Set<Tile>();
  for (const tile of proposed) {
    for (const parent of ancestors(tile)) refined.add(parent);
  }
  for (const tile of previous) {
    if (!isLoadedMesh(tile) || !inView(tile)) continue;
    for (const parent of ancestors(tile)) {
      if (
        parent.refine === "REPLACE" &&
        proposed.has(parent) &&
        !canCoarsenMeshQuartet(parent, previous, requestedError)
      ) {
        rejected.add(parent);
      }
    }
  }
  for (const parent of rejected) result.delete(parent);
  for (const tile of previous) {
    if (!isLoadedMesh(tile) || refined.has(tile)) continue;
    // Keep the whole previous family under a rejected ancestor, including
    // its fringe, rather than introduce holes at the viewport boundary.
    const parents = [...ancestors(tile)];
    if (
      !parents.some(
        (parent) => parent.refine === "REPLACE" && result.has(parent)
      ) &&
      (inView(tile) || parents.some((parent) => rejected.has(parent)))
    ) {
      result.add(tile);
    }
  }
  return result;
};
