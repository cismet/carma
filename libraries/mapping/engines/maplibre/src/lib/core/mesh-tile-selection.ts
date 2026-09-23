import type { Tile } from "3d-tiles-renderer/core";
import {
  LOADED,
  isLoadedMesh,
  isMeshTileUnconditionallyRefined,
  meshTileAncestors,
} from "./mesh-tile-coverage";
import {
  hasMeshRefinementContentInView,
  isPublishedMeshRefinementLevel,
} from "./mesh-tile-refinement";
import { TILES_LOAD_POLICY } from "./tile-load-config";

/**
 * Select ready content in this demand domain. A REPLACE parent supplies the
 * uncovered branches while ready descendants render immediately above it.
 * Completeness is relative to this frustum; unknown topology fails closed.
 * Decision: ../../../TILES_COVERAGE.md#progressive-receiver-overlays
 */
export const selectMeshReceiverPlan = (
  root: Tile,
  targetErrorPixels: number,
  maximumInitialErrorPixels: number,
  inView: (tile: Tile) => boolean,
  errorPixels: (tile: Tile) => number,
  receiverReady: (tile: Tile) => boolean = isLoadedMesh,
  retainedAncestors: ReadonlySet<Tile> = new Set(),
  options?: Readonly<{
    published: ReadonlySet<Tile>;
    allowCoarseBootstrap?: boolean;
    firstImageErrorTargetPixels?: number;
  }>
) => {
  const refinementSupport = new Set<Tile>();
  const unpreparedParents = new Set<Tile>();
  const materialWaits = new Set<Tile>();
  const published = options?.published ?? new Set<Tile>();
  const fallbackLimit = options
    ? options.firstImageErrorTargetPixels ??
      TILES_LOAD_POLICY.firstImageMaxErrorPixels
    : maximumInitialErrorPixels;
  const visit = (tile: Tile): { cut: Tile[]; complete: boolean } => {
    if (!tile.internal || !tile.traversal) return { cut: [], complete: false };
    if (!inView(tile)) return { cut: [], complete: true };
    if (isPublishedMeshRefinementLevel(tile, published))
      refinementSupport.add(tile);
    const children = tile.children ?? [];
    if (
      tile.internal.hasUnrenderableContent &&
      tile.internal.loadingState !== LOADED
    )
      return { cut: [], complete: false };
    if (
      tile.internal.hasContent === false &&
      !tile.internal.hasRenderableContent &&
      !tile.internal.hasUnrenderableContent &&
      children.length === 0
    )
      return { cut: [], complete: true };
    const error = errorPixels(tile);
    const loaded = isLoadedMesh(tile);
    const materialReady = loaded && receiverReady(tile);
    if (loaded && !materialReady) materialWaits.add(tile);
    const fallback =
      materialReady &&
      !isMeshTileUnconditionallyRefined(tile) &&
      Number.isFinite(error) &&
      (published.size > 0 ||
        options?.allowCoarseBootstrap ||
        error <= fallbackLimit ||
        children.length === 0);
    if (
      fallback &&
      ((error <= targetErrorPixels && !retainedAncestors.has(tile)) ||
        children.length === 0 ||
        children.every(
          (child) =>
            !hasMeshRefinementContentInView(
              child,
              (candidate) =>
                !candidate.internal || !candidate.traversal || inView(candidate)
            )
        ))
    )
      return { cut: [tile], complete: true };
    const selected: Tile[] = [];
    let complete = children.length > 0;
    for (const child of children) {
      if (!child.internal || !child.traversal) unpreparedParents.add(tile);
      const result = visit(child);
      selected.push(...result.cut);
      complete &&= result.complete;
    }
    if (tile.refine === "ADD" && tile.internal.hasRenderableContent)
      return {
        cut: fallback ? [tile, ...selected] : selected,
        complete: complete && fallback,
      };
    if (!complete && fallback)
      return { cut: [tile, ...selected], complete: true };
    return { cut: selected, complete };
  };
  return {
    tiles: new Set(visit(root).cut),
    refinementSupport,
    unpreparedParents,
    materialWaits,
  };
};

/** Use the same progressive selection for the light-frustum caster domain. */
export const refineLoadedMeshFrontier = (
  proposed: ReadonlySet<Tile>,
  requestedError: number,
  inView: (tile: Tile) => boolean,
  errorPixels: (tile: Tile) => number = (tile) => tile.traversal.error,
  minimumFrontier: ReadonlySet<Tile> = new Set(),
  contentReady: (tile: Tile) => boolean = isLoadedMesh
): Set<Tile> => {
  const requiredAncestors = new Set<Tile>();
  for (const tile of minimumFrontier) {
    if (!isLoadedMesh(tile)) continue;
    for (const parent of meshTileAncestors(tile)) requiredAncestors.add(parent);
  }
  const result = new Set<Tile>();
  for (const tile of proposed) {
    if (
      [...meshTileAncestors(tile)].some(
        (parent) => parent.refine === "REPLACE" && proposed.has(parent)
      )
    )
      continue;
    for (const member of selectMeshReceiverPlan(
      tile,
      requestedError,
      Number.POSITIVE_INFINITY,
      inView,
      errorPixels,
      contentReady,
      requiredAncestors,
      { published: proposed, allowCoarseBootstrap: true }
    ).tiles)
      result.add(member);
  }
  return result;
};
