import type { Tile } from "3d-tiles-renderer/core";

// Upstream's allChildrenLoaded also accepts FAILED. It is not a coverage proof.
export const LOADED = 4;

export const isLoadedMesh = (tile: Tile): boolean =>
  tile.internal?.hasRenderableContent && tile.internal.loadingState === LOADED;

export const hasDisplayedAncestor = (
  tile: Tile,
  displayed: ReadonlySet<Tile>
): boolean => {
  for (let current: Tile | null = tile; current; current = current.parent) {
    if (displayed.has(current) && isLoadedMesh(current)) return true;
  }
  return false;
};

/** Upstream sets this flag in core/renderer/tiles/traverseFunctions.js, but its
 * TileTraversalData declaration omits it. Keep the verified runtime adapter
 * here rather than widening the upstream Tile type or bypassing type checks.
 */
export const isMeshTileUnconditionallyRefined = (tile: Tile): boolean =>
  (
    tile.traversal as Tile["traversal"] & {
      unconditionallyRefine?: boolean;
    }
  )?.unconditionallyRefine === true;

/**
 * Prove regional coverage from the hierarchy, not from visible leaves alone or
 * global queue idleness. A published coarse REPLACE tile is sufficient at its
 * explicit stage error; otherwise every intersecting branch must have a real
 * published replacement. FAILED and unknown metadata are never coverage.
 * Inputs are read-only; repeated regional queries can share a snapshot query.
 */
export const getReadyMeshRegionCut = (
  root: Tile,
  published: ReadonlySet<Tile>,
  errorPixels: number,
  demand: (tile: Tile) => { intersects: boolean; errorPixels: number }
): readonly Tile[] | null =>
  createMeshRegionCutQuery(published, errorPixels, demand)(root);

/** Reuse subtree proofs within one immutable demand/frontier snapshot.
 * Memo storage belongs to this query; no input tiles or collections are changed.
 */
export const createMeshRegionCutQuery = (
  published: ReadonlySet<Tile>,
  errorPixels: number,
  demand: (tile: Tile) => { intersects: boolean; errorPixels: number }
): ((root: Tile) => readonly Tile[] | null) => {
  const cache = new Map<Tile, readonly Tile[] | null>();
  const visit = (tile: Tile): readonly Tile[] | null => {
    if (cache.has(tile)) return cache.get(tile)!;
    const result = read(tile);
    cache.set(tile, result);
    return result;
  };
  const read = (tile: Tile): readonly Tile[] | null => {
    const internal = tile.internal;
    if (!internal) return null;
    const target = demand(tile);
    if (!target.intersects) return [];
    const children = tile.children ?? [];
    if (
      internal.hasUnrenderableContent &&
      (internal.loadingState !== LOADED || children.length === 0)
    )
      return null;
    const displayable = isLoadedMesh(tile) && published.has(tile);
    const unconditional = isMeshTileUnconditionallyRefined(tile);
    if (
      tile.refine === "REPLACE" &&
      displayable &&
      !unconditional &&
      (target.errorPixels <= errorPixels || children.length === 0)
    )
      return [tile];
    const result: Tile[] = [];
    if (tile.refine === "ADD" && internal.hasRenderableContent) {
      if (!displayable) return null;
      result.push(tile);
      if (!unconditional && target.errorPixels <= errorPixels) return result;
    }
    if (children.length === 0) {
      return !internal.hasContent && !internal.hasRenderableContent
        ? result
        : displayable && !unconditional
        ? [tile]
        : null;
    }
    for (const child of children) {
      const childCut = visit(child);
      if (!childCut) return null;
      result.push(...childCut);
    }
    return result;
  };
  return (root: Tile) =>
    Number.isFinite(errorPixels) && errorPixels > 0 ? visit(root) : null;
};

/** The nearest ancestor at or above the extent floor is loaded: dropping the tile leaves no hole. */
export const hasLoadedExtentFloorAncestor = (
  tile: Tile,
  extentGeometricError: number
): boolean => {
  for (let parent = tile.parent; parent; parent = parent.parent) {
    // External tileset pages repeat their parent's error but carry no mesh.
    // They must not hide a resident payload farther up the same ancestry.
    if (
      parent.internal?.hasRenderableContent &&
      parent.geometricError >= extentGeometricError
    )
      return isLoadedMesh(parent);
  }
  return false;
};

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

/**
 * A resident payload can leave the cache without opening a previously rendered
 * region only when a loaded REPLACE ancestor or a complete loaded descendant
 * cut can draw the same region. This deliberately ignores camera visibility:
 * leaving the viewport is not replacement coverage.
 */
export const isMeshCoverageRemovalSafe = (
  tile: Tile,
  resident: Pick<ReadonlySet<Tile>, "has">,
  acceptsAncestor: (ancestor: Tile) => boolean = () => true
): boolean => {
  for (let parent = tile.parent; parent; parent = parent.parent) {
    if (
      parent.refine === "REPLACE" &&
      resident.has(parent) &&
      isLoadedMesh(parent) &&
      acceptsAncestor(parent)
    )
      return true;
  }
  const hasCompleteReplacement = (candidate: Tile): boolean => {
    if (candidate.refine !== "REPLACE" || !candidate.children?.length)
      return false;
    return candidate.children.every(
      (child) =>
        (resident.has(child) && isLoadedMesh(child)) ||
        hasCompleteReplacement(child)
    );
  };
  return hasCompleteReplacement(tile);
};

export const meshTileAncestors = function* (tile: Tile): Generator<Tile> {
  for (let parent = tile.parent; parent; parent = parent.parent) yield parent;
};
