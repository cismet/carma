import type { Tile } from "3d-tiles-renderer/core";
import {
  initialMeshLoadError,
  meshShadowStageError,
} from "./three-tiles-load-policy";

// Upstream's allChildrenLoaded also accepts FAILED. It is not a coverage proof.
const LOADED = 4;
const isLoadedMesh = (tile: Tile): boolean =>
  tile.internal?.hasRenderableContent && tile.internal.loadingState === LOADED;

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

/** Casters never become receiver demand merely because they are in view. */
export const selectMeshReceiverCut = (
  cut: readonly Tile[],
  receiverRoots: ReadonlySet<Tile>
): Set<Tile> =>
  new Set(
    cut.filter((tile) => {
      for (
        let ancestor: Tile | null = tile;
        ancestor;
        ancestor = ancestor.parent
      ) {
        if (receiverRoots.has(ancestor)) return true;
      }
      return false;
    })
  );

export const isMeshRefinementBeyondStage = (
  tile: Tile,
  frontier: ReadonlySet<Tile>,
  committed: ReadonlySet<Tile>,
  maximumCasterGeometricError = Number.POSITIVE_INFINITY
): boolean => {
  let intermediatePayload = false;
  let nearestPayload: Tile | null = null;
  for (let parent = tile.parent; parent; parent = parent.parent) {
    const payload =
      parent.internal?.hasRenderableContent &&
      !isMeshTileUnconditionallyRefined(parent);
    if (payload && !nearestPayload) nearestPayload = parent;
    if (frontier.has(parent)) {
      // A child may be required as a direct caster for another, finer
      // receiver even before its own receiver family can publish. Deferring
      // that dependency would make the atomic publication gate self-locking.
      if (
        nearestPayload &&
        nearestPayload.geometricError > maximumCasterGeometricError
      )
        return false;
      return !committed.has(parent) || intermediatePayload;
    }
    if (
      parent.internal?.hasRenderableContent &&
      !isMeshTileUnconditionallyRefined(parent)
    )
      intermediatePayload = true;
  }
  return false;
};

/**
 * Receiver demand may discover independent loaded families underneath an
 * unusably coarse ancestor. A missing sibling must not hide those candidates
 * behind that ancestor. When a committed cut is supplied, each family starts
 * at <=16px and requests its next half-error stage only after joint publication.
 * This does NOT publish them: the corridor gate still requires their complete
 * equally detailed caster cut.
 */
export const collectLoadedMeshReceiverCandidates = (
  root: Tile,
  targetErrorPixels: number,
  maximumInitialErrorPixels: number,
  inView: (tile: Tile) => boolean,
  errorPixels: (tile: Tile) => number,
  committed?: ReadonlySet<Tile>,
  presented?: ReadonlySet<Tile>
): Set<Tile> => {
  const refinedAncestors = new Set<Tile>();
  for (const tile of committed ?? []) {
    for (let parent = tile.parent; parent; parent = parent.parent)
      refinedAncestors.add(parent);
  }
  const stageError = (tile: Tile): number => {
    if (!committed) return targetErrorPixels;
    for (let parent: Tile | null = tile; parent; parent = parent.parent) {
      if (committed.has(parent))
        return Math.max(
          targetErrorPixels,
          meshShadowStageError(errorPixels(parent), targetErrorPixels) /
            (presented && !presented.has(parent) ? 1 : 2)
        );
    }
    return maximumInitialErrorPixels;
  };
  const visit = (tile: Tile): { cut: Tile[]; complete: boolean } => {
    if (!inView(tile)) return { cut: [], complete: true };
    if (!tile.internal || !tile.traversal) return { cut: [], complete: false };
    if (
      tile.internal.hasUnrenderableContent &&
      tile.internal.loadingState !== LOADED
    )
      return { cut: [], complete: false };
    const error = errorPixels(tile);
    const fallback =
      isLoadedMesh(tile) &&
      !isMeshTileUnconditionallyRefined(tile) &&
      Number.isFinite(error) &&
      error <= maximumInitialErrorPixels &&
      !refinedAncestors.has(tile);
    const children = tile.children ?? [];
    if (fallback && (error <= stageError(tile) || children.length === 0))
      return { cut: [tile], complete: true };
    const selected: Tile[] = [];
    let complete = children.length > 0;
    for (const child of children) {
      const result = visit(child);
      selected.push(...result.cut);
      complete &&= result.complete;
    }
    if (fallback && (!complete || tile.refine === "ADD")) {
      return {
        cut: tile.refine === "ADD" ? [tile, ...selected] : [tile],
        complete: true,
      };
    }
    return { cut: selected, complete };
  };
  return new Set(visit(root).cut);
};

/**
 * Prove regional coverage from the hierarchy, not from visible leaves alone or
 * global queue idleness. A published coarse REPLACE tile is sufficient at its
 * explicit stage error; otherwise every intersecting branch must have a real
 * published replacement. FAILED and unknown metadata are never coverage.
 */
export const getReadyMeshRegionCut = (
  root: Tile,
  published: ReadonlySet<Tile>,
  errorPixels: number,
  demand: (tile: Tile) => { intersects: boolean; errorPixels: number }
): readonly Tile[] | null => {
  const visit = (tile: Tile): Tile[] | null => {
    const target = demand(tile);
    if (!target.intersects) return [];
    const internal = tile.internal;
    if (!internal) return null;
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
  return Number.isFinite(errorPixels) && errorPixels > 0 ? visit(root) : null;
};

/**
 * Commit each receiver REPLACE family together with its complete caster cut.
 * Loaded receivers are demand, not permission to display incomplete shadows.
 * Every trial also checks the already committed families, so shared caster
 * ancestors cannot be replaced by a partial child cut for only one receiver.
 */
export const advanceMeshCorridorFrontier = ({
  receivers,
  casters,
  proposed,
  resolveCasters,
  maximumInitialErrorPixels = 16,
  errorPixels = (tile) => tile.traversal.error,
  presented,
}: {
  receivers: ReadonlySet<Tile>;
  casters: ReadonlySet<Tile>;
  proposed: ReadonlySet<Tile>;
  maximumInitialErrorPixels?: number;
  errorPixels?: (tile: Tile) => number;
  /** When supplied, an unpresented receiver cannot be replaced by any trial. */
  presented?: ReadonlySet<Tile>;
  resolveCasters: (receivers: ReadonlySet<Tile>) => {
    receivers: ReadonlySet<Tile>;
    casters: readonly Tile[];
  } | null;
}): { receivers: Set<Tile>; casters: Set<Tile>; pending: boolean } => {
  const contains = (parent: Tile, tile: Tile): boolean => {
    for (let entry: Tile | null = tile; entry; entry = entry.parent) {
      if (entry === parent) return true;
    }
    return false;
  };
  const families = new Map<Tile, Tile[]>();
  for (const tile of proposed) {
    let family = tile;
    for (let entry: Tile | null = tile; entry; entry = entry.parent) {
      if (receivers.has(entry)) {
        family = entry;
        break;
      }
    }
    const members = families.get(family) ?? [];
    members.push(tile);
    families.set(family, members);
  }
  let nextReceivers = new Set(receivers);
  let nextCasters = new Set(casters);
  let pending = false;
  const preservesUnpresented = (candidate: ReadonlySet<Tile>) =>
    !presented ||
    [...nextReceivers].every(
      (tile) => presented.has(tile) || candidate.has(tile)
    );
  for (const [family, members] of families) {
    const candidate = new Set(
      [...nextReceivers].filter((tile) => !contains(family, tile))
    );
    for (const tile of members) candidate.add(tile);
    const readyCasters = resolveCasters(candidate);
    // Shared caster closure may refine a different receiver family than the
    // one proposed. That must not skip its not-yet-drawn coarse hard shadow.
    if (readyCasters && !preservesUnpresented(readyCasters.receivers)) {
      pending = true;
      continue;
    }
    if (readyCasters === null) {
      pending = true;
      // Cold cache hits may already expose fine receivers while their fine
      // casters are missing. Prefer a complete loaded <=16px ancestor pair
      // over withholding the entire first surface until final resolution.
      for (let parent = family.parent; parent; parent = parent.parent) {
        const parentError = errorPixels(parent);
        if (
          !isLoadedMesh(parent) ||
          parent.refine !== "REPLACE" ||
          !Number.isFinite(parentError) ||
          parentError > maximumInitialErrorPixels ||
          [...nextReceivers].some(
            (tile) => contains(parent, tile) || contains(tile, parent)
          )
        )
          continue;
        const fallbackReceivers = new Set([...nextReceivers, parent]);
        const fallback = resolveCasters(fallbackReceivers);
        if (!fallback || !preservesUnpresented(fallback.receivers)) continue;
        nextReceivers = new Set(fallback.receivers);
        nextCasters = new Set(fallback.casters);
        break;
      }
      continue;
    }
    nextReceivers = new Set(readyCasters.receivers);
    nextCasters = new Set(readyCasters.casters);
  }
  return { receivers: nextReceivers, casters: nextCasters, pending };
};

/**
 * Bootstrap to coarse coverage, then admit one generation below each ready
 * local fallback. A slow sibling elsewhere must not hold this branch at 16px.
 * Inspect only the nearest displayable parent: older ancestors may have had
 * their redundant payload evicted after their children replaced them.
 */
export const shouldDeferMeshRefinement = (
  tile: Tile,
  requestedError: number
): boolean => {
  for (let parent = tile.parent; parent; parent = parent.parent) {
    if (
      !parent.internal?.hasRenderableContent ||
      parent.refine !== "REPLACE" ||
      isMeshTileUnconditionallyRefined(parent)
    )
      continue;
    return (
      parent.traversal.error <= requestedError ||
      (parent.traversal.error <= initialMeshLoadError(requestedError) &&
        !isLoadedMesh(parent))
    );
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

const ancestors = function* (tile: Tile): Generator<Tile> {
  for (let parent = tile.parent; parent; parent = parent.parent) yield parent;
};

/**
 * Select a complete loaded cut per visible REPLACE family. Upstream's ancestor
 * fallback can stop at a city-sized parent while an offscreen sibling loads.
 * Only camera-intersecting children need to cover that parent's visible area;
 * each child may itself remain coarse. Never overlay children on their parent.
 * Unknown metadata and failed content are not proof of replacement coverage.
 */
export const refineLoadedMeshFrontier = (
  proposed: ReadonlySet<Tile>,
  requestedError: number,
  inView: (tile: Tile) => boolean
): Set<Tile> => {
  const select = (tile: Tile): Tile[] | null => {
    if (!tile.internal || !tile.traversal) return null;
    const fallback = isLoadedMesh(tile) ? [tile] : null;
    if (tile.refine !== "REPLACE") return null;
    if (fallback && tile.traversal.error <= requestedError) return fallback;
    if (
      tile.internal.hasUnrenderableContent &&
      tile.internal.loadingState !== LOADED
    )
      return null;
    const children = (tile.children ?? []).filter(
      (child) => !child.traversal || inView(child)
    );
    if (children.length === 0) return fallback;
    const selected: Tile[] = [];
    for (const child of children) {
      const cut = select(child);
      if (!cut) return fallback;
      selected.push(...cut);
    }
    return selected;
  };
  const result = new Set<Tile>();
  for (const tile of proposed) {
    const cut = inView(tile) ? select(tile) : null;
    for (const selected of cut ?? [tile]) result.add(selected);
  }
  return result;
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
