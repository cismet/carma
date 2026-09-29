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
import { createMeshFamilyCoverage } from "./mesh-family-coverage";
import { TILES_LOAD_POLICY } from "./tile-load-config";

/**
 * Publish one non-overlapping REPLACE cut per demand domain. A parent stays
 * alone until every child branch is drawable. Independent families
 * can refine independently; unknown topology fails closed.
 * Decision: ../../../TILES_COVERAGE.md#exclusive-mesh-publication
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
    /** Let a shared shadow cut leave a proven empty observer region. */
    releaseEmptyReplacementRegions?: boolean;
  }>
) => {
  const familyCoverage = createMeshFamilyCoverage(receiverReady);
  const refinementSupport = new Set<Tile>();
  const unpreparedParents = new Set<Tile>();
  const materialWaits = new Set<Tile>();
  const published = options?.published ?? new Set<Tile>();
  const publishedRefinement = new Set<Tile>();
  for (const tile of published) {
    if (!isLoadedMesh(tile) || !inView(tile)) continue;
    for (const parent of meshTileAncestors(tile))
      publishedRefinement.add(parent);
  }
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
    // The containing family already owns this first missing payload. Finish
    // that generation before opening its descendants: a missing fallback is
    // not permission to enqueue the entire deeper subtree during recovery.
    if (
      !loaded &&
      refinementSupport.has(tile) &&
      !publishedRefinement.has(tile)
    )
      return { cut: [], complete: false };
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
    const childrenMissView = () =>
      children.every(
        (child) =>
          !hasMeshRefinementContentInView(
            child,
            (candidate) =>
              !candidate.internal || !candidate.traversal || inView(candidate)
          )
      );
    // A loose parent box can intersect while every real child misses. Release
    // that proven empty REPLACE region independently of current error demand;
    // otherwise removing its receiver removes the shadow floor and the next
    // frame resurrects the same coarse parent through the camera-error shortcut.
    if (
      options?.releaseEmptyReplacementRegions &&
      tile.refine !== "ADD" &&
      children.length > 0 &&
      childrenMissView()
    )
      return { cut: [], complete: true };
    if (
      fallback &&
      ((error <= targetErrorPixels &&
        !retainedAncestors.has(tile) &&
        !publishedRefinement.has(tile)) ||
        children.length === 0 ||
        (!options?.releaseEmptyReplacementRegions && childrenMissView()))
    )
      return { cut: [tile], complete: true };
    const family =
      tile.refine === "REPLACE" &&
      tile.internal.hasRenderableContent &&
      !isMeshTileUnconditionallyRefined(tile)
        ? familyCoverage(tile)
        : null;
    if (family) {
      for (const member of family.support) {
        refinementSupport.add(member);
        if (isLoadedMesh(member) && !receiverReady(member))
          materialWaits.add(member);
      }
      for (const owner of family.unpreparedParents)
        unpreparedParents.add(owner);
      // Finish this family before opening deeper generations. The visible
      // parent remains alone while off-camera geometry/materials become ready.
      if (!family.ready && fallback && !publishedRefinement.has(tile))
        return { cut: [tile], complete: true };
    }
    // A conservative parent can intersect while every resolved child misses.
    // Required refinement may replace it with that proven empty domain; unknown
    // topology remains incomplete below, and ADD still keeps its own content.
    const selected: Tile[] = [];
    let complete = children.length > 0 && (family?.ready ?? true);
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
    // A newly exposed sibling may still be loading after a pan. Keep the
    // already published fine branches; never resurrect their shared parent.
    // Families whose parent is still published keep that parent alone as usual.
    if (!complete && fallback && !publishedRefinement.has(tile))
      return { cut: [tile], complete: true };
    return { cut: selected, complete };
  };
  return {
    tiles: new Set(visit(root).cut),
    refinementSupport,
    unpreparedParents,
    materialWaits,
  };
};
