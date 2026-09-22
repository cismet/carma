import type { Tile } from "3d-tiles-renderer/core";
import {
  TILES_LOAD_POLICY,
  initialMeshLoadError,
  meshShadowStageError,
} from "./three-tiles-load-policy";

// Upstream's allChildrenLoaded also accepts FAILED. It is not a coverage proof.
const LOADED = 4;
const isLoadedMesh = (tile: Tile): boolean =>
  tile.internal?.hasRenderableContent && tile.internal.loadingState === LOADED;

/** O(tree depth) membership check; never enumerate the resident tile pool. */
/**
 * Loaded REPLACE ancestors of the displayed cut that still have an in-view
 * child without any displayed descendant: that quadrant is a hole. Drawn
 * underneath the finer tiles that exist, the ancestor fills it until the
 * children arrive, the coverage-first idea of Cesium's skip-LOD ancestor
 * pass without a stencil buffer. Never a replacement, only an underlay; the
 * retained cut keeps refusing such an ancestor as a fallback on its own.
 */
export const selectMeshUnderlayParents = (
  displayed: ReadonlySet<Tile>,
  inView: (tile: Tile) => boolean,
  ready: (tile: Tile) => boolean = () => true,
  floor: Iterable<Tile> = []
): Set<Tile> => {
  const refined = new Set<Tile>();
  for (const tile of displayed)
    for (let parent = tile.parent; parent; parent = parent.parent)
      refined.add(parent);
  // An in-view branch under a refined node that neither displays a tile nor
  // holds a displayed descendant is uncovered; the test descends through
  // refined nodes, since a hole can sit several levels below the ancestor.
  // A child the renderer has not preprocessed has no bounds to answer the
  // view test: unknown coverage is a hole, not proof of being outside.
  const hasHole = (tile: Tile): boolean =>
    (tile.children ?? []).some((child) => {
      if (!child.traversal) return true;
      if (!inView(child) || displayed.has(child)) return false;
      return refined.has(child) ? hasHole(child) : true;
    });
  const underlay = new Set<Tile>();
  const floorSet = new Set(floor);
  for (const ancestor of new Set([...refined, ...floorSet])) {
    if (displayed.has(ancestor) || ancestor.refine !== "REPLACE") continue;
    if (!isLoadedMesh(ancestor) || !ready(ancestor) || !inView(ancestor))
      continue;
    if (hasHole(ancestor)) underlay.add(ancestor);
  }
  // Keep only the finest loaded ancestor per hole: drop any underlay that has
  // another underlay below it. The extent floor stays: a finer underlay
  // below it covers one hole, not the floor tile's whole region.
  for (const tile of [...underlay])
    for (let parent = tile.parent; parent; parent = parent.parent)
      if (underlay.has(parent) && !floorSet.has(parent))
        underlay.delete(parent);
  return underlay;
};

export const hasDisplayedAncestor = (
  tile: Tile,
  displayed: ReadonlySet<Tile>
): boolean => {
  for (let current: Tile | null = tile; current; current = current.parent) {
    if (displayed.has(current) && isLoadedMesh(current)) return true;
  }
  return false;
};

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
  presented?: ReadonlySet<Tile>,
  receiverReady: (tile: Tile, support?: boolean) => boolean = isLoadedMesh,
  retainedAncestors: ReadonlySet<Tile> = new Set(),
  options?: Readonly<{
    published: ReadonlySet<Tile>;
    support: Set<Tile>;
    unpreparedParents?: Set<Tile>;
    /** Publish the first view together; subsequently promote resident reserves. */
    atomic?: boolean;
    /** Cold first fill can complete only the intersecting replacement branches. */
    completeOffscreenFamilies?: boolean;
    /** Hard shadows can iterate on a complete coarse surface immediately. */
    allowCoarseBootstrap?: boolean;
    firstImageErrorTargetPixels?: number;
    onIncompletePublishedFamily?: (parent: Tile) => void;
    onWait?: (
      tile: Tile,
      reason: "material" | "replacement-family",
      blocker?: Tile
    ) => void;
  }>
): Set<Tile> => {
  options?.support.clear();
  options?.unpreparedParents?.clear();
  // Initial quality is a request goal. First publication additionally requires
  // a useful complete image (<=64px); later movement keeps resident coverage.
  // This is separate
  // from shadow receiver/caster publication, which owns its own atomic gate.
  const residentFallback = Boolean(options?.atomic && options.published.size);
  const publishedRefinements = new Map<Tile, readonly Tile[]>();
  const publishedCoverage = new Map<Tile, readonly Tile[] | null>();
  let publishedBranches: Map<Tile, Tile[]> | undefined;
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
  const visit = (
    tile: Tile,
    completeFamily = false
  ): { cut: Tile[]; complete: boolean; blocker?: Tile } => {
    // A raw hierarchy entry the renderer has not preprocessed yet has no
    // bounds, so it cannot answer the view test; it is unknown coverage, not
    // proof of being outside the view. Testing the view first let an
    // unloaded in-view subtree count as covered and stalled the first pass.
    if (!tile.internal || !tile.traversal) {
      if (completeFamily) options?.support.add(tile);
      return { cut: [], complete: false, blocker: tile };
    }
    const visible = inView(tile);
    if (!visible && !completeFamily) {
      // Decision: FRUSTUM-REPLACEMENT-20260914 in TILES_COVERAGE.md.
      // Replacement completeness is relative to the current demand union.
      // An offscreen sibling must not recursively create finer support jobs.
      return { cut: [], complete: true };
    }
    // Visible siblings are publication prerequisites too. Otherwise offscreen
    // support requests outrank the last visible members of the same family.
    if (
      options?.atomic &&
      isPublishedMeshRefinementLevel(tile, options.published)
    )
      options.support.add(tile);
    // Complete only the immediate replacement family, not another offscreen
    // refinement tree. Publishing a viewport-only subset forces a downgrade
    // on the next drag into an unloaded sibling. A ready sibling is retained
    // with this cut; a missing one uses the existing bounded support queue.
    if (!visible && completeFamily) {
      if (
        tile.internal.hasRenderableContent &&
        !isMeshTileUnconditionallyRefined(tile)
      ) {
        options?.support.add(tile);
        return isLoadedMesh(tile) && receiverReady(tile, true)
          ? { cut: [tile], complete: true }
          : { cut: [], complete: false, blocker: tile };
      }
      if (
        tile.internal.hasUnrenderableContent &&
        tile.internal.loadingState !== LOADED
      )
        options?.support.add(tile);
    }
    if (
      tile.internal.hasUnrenderableContent &&
      tile.internal.loadingState !== LOADED
    )
      return { cut: [], complete: false, blocker: tile };
    if (
      tile.internal.hasContent === false &&
      !tile.internal.hasRenderableContent &&
      !tile.internal.hasUnrenderableContent &&
      !tile.children?.length
    )
      return { cut: [], complete: true };
    const error = errorPixels(tile);
    const loaded = isLoadedMesh(tile);
    const materialReady = loaded && receiverReady(tile);
    if (loaded && !materialReady) options?.onWait?.(tile, "material");
    const fallback =
      materialReady &&
      !isMeshTileUnconditionallyRefined(tile) &&
      Number.isFinite(error) &&
      (options?.atomic
        ? residentFallback ||
          options.allowCoarseBootstrap ||
          error <=
            (options.firstImageErrorTargetPixels ??
              TILES_LOAD_POLICY.firstImageMaxErrorPixels)
        : error <= maximumInitialErrorPixels ||
          options?.published.has(tile) ||
          tile.children.length === 0) &&
      (options?.atomic ||
        (!refinedAncestors.has(tile) && !retainedAncestors.has(tile)));
    const children = tile.children ?? [];
    // Decision: DRAG-RESIDENT-SIBLINGS-20260916 in TILES_COVERAGE.md.
    // A newly visible, resident sibling was not in the previous displayed cut.
    // Try its ready branch before using the motion-stage parent; otherwise the
    // retention check sees a partial old cut and downgrades the whole family.
    // Missing/unready siblings still take the complete parent fallback below.
    if (
      fallback &&
      ((error <= stageError(tile) && !retainedAncestors.has(tile)) ||
        children.length === 0)
    )
      return { cut: [tile], complete: true };
    const selected: Tile[] = [];
    let complete = children.length > 0;
    let blocker: Tile | undefined;
    for (const child of children) {
      // Decision: ../../../TILES_COVERAGE.md#raw-replacement-topology-liveness
      // Raw hierarchy children have no parent pointer until native preprocessing.
      // Keep the known parent so publication can schedule that prerequisite.
      if (!child.internal || !child.traversal)
        options?.unpreparedParents?.add(tile);
      const result = visit(
        child,
        completeFamily ||
          Boolean(
            options?.atomic &&
              options.completeOffscreenFamilies !== false &&
              tile.refine === "REPLACE" &&
              tile.internal.hasRenderableContent
          )
      );
      selected.push(...result.cut);
      if (!result.complete) blocker ??= result.blocker ?? child;
      complete &&= result.complete;
    }
    if (
      complete &&
      selected.length > 0 &&
      tile.refine === "REPLACE" &&
      options?.published.has(tile)
    )
      publishedRefinements.set(tile, selected);
    if (fallback && (!complete || tile.refine === "ADD")) {
      // A published branch can replace its own complete child family without
      // waiting for an unrelated branch higher in the hierarchy. Only reuse
      // the old cut when it still covers this view; exposed holes need fallback.
      if (
        !complete &&
        tile.refine === "REPLACE" &&
        options?.atomic &&
        retainedAncestors.has(tile) &&
        publishedRefinements.size > 0
      ) {
        if (!publishedBranches) {
          publishedBranches = new Map();
          for (const member of options.published)
            for (
              let parent: Tile | null = member;
              parent;
              parent = parent.parent
            ) {
              const branch = publishedBranches.get(parent) ?? [];
              branch.push(member);
              publishedBranches.set(parent, branch);
            }
        }
        const branch = publishedBranches.get(tile) ?? [];
        if (
          branch.some((member) => publishedRefinements.has(member)) &&
          branch.every(
            (member) => isLoadedMesh(member) && receiverReady(member, true)
          ) &&
          getReadyMeshRegionCut(
            tile,
            options.published,
            Number.MAX_VALUE,
            (member) => ({ intersects: inView(member), errorPixels: 0 }),
            publishedCoverage
          ) !== null
        )
          return {
            cut: branch.flatMap(
              (member) => publishedRefinements.get(member) ?? [member]
            ),
            complete: true,
          };
      }
      if (!complete && tile.refine === "REPLACE")
        for (const child of selected)
          options?.onWait?.(child, "replacement-family", blocker);
      if (!complete && options?.atomic && retainedAncestors.has(tile))
        options.onIncompletePublishedFamily?.(tile);
      return {
        cut: tile.refine === "ADD" ? [tile, ...selected] : [tile],
        complete: true,
      };
    }
    return {
      cut: selected,
      complete,
      blocker: complete ? undefined : blocker ?? tile,
    };
  };
  const result = visit(root);
  return new Set(
    options?.atomic && !residentFallback && !result.complete ? [] : result.cut
  );
};

/**
 * Prove regional coverage from the hierarchy, not from visible leaves alone or
 * global queue idleness. A published coarse REPLACE tile is sufficient at its
 * explicit stage error; otherwise every intersecting branch must have a real
 * published replacement. FAILED and unknown metadata are never coverage.
 * An optional cache belongs to one immutable camera/frontier/error snapshot.
 */
export const getReadyMeshRegionCut = (
  root: Tile,
  published: ReadonlySet<Tile>,
  errorPixels: number,
  demand: (tile: Tile) => { intersects: boolean; errorPixels: number },
  cache?: Map<Tile, readonly Tile[] | null>
): readonly Tile[] | null => {
  const visit = (tile: Tile): readonly Tile[] | null => {
    if (cache?.has(tile)) return cache.get(tile)!;
    const result = read(tile);
    cache?.set(tile, result);
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
    // A retained finer branch forbids its parent fallback. Fill missing sibling
    // regions at this cut instead of waiting for/reloading that coarse parent.
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

/**
 * Ancestors of the displayed cut below the extent floor, into `target`: the
 * band a zoom-out step regresses through, kept resident by the runtime.
 */
export const collectResidentAncestors = (
  displayed: ReadonlySet<Tile>,
  extentGeometricError: number,
  target: Set<Tile>
): Set<Tile> => {
  target.clear();
  for (const tile of displayed) {
    for (let parent = tile.parent; parent; parent = parent.parent) {
      if (target.has(parent) || parent.geometricError >= extentGeometricError)
        break;
      target.add(parent);
    }
  }
  return target;
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
  inView: (tile: Tile) => boolean,
  errorPixels: (tile: Tile) => number = (tile) => tile.traversal.error,
  minimumFrontier: ReadonlySet<Tile> = new Set(),
  onWait?: (tile: Tile, blocker: Tile) => void
): Set<Tile> => {
  // Decision: engines/maplibre/README.md#linked-receivercaster-detail.
  // A parent meeting caster SSE must not mask already displayed finer geometry.
  // Only a missing corridor-relevant sibling may keep its depth fallback alive.
  const requiredAncestors = new Set<Tile>();
  for (const tile of minimumFrontier) {
    if (!isLoadedMesh(tile)) continue;
    for (const parent of ancestors(tile)) requiredAncestors.add(parent);
  }
  const select = (tile: Tile): Tile[] | null => {
    if (!tile.internal || !tile.traversal) return null;
    // A parsed, content-free leaf is a complete empty branch. Unknown metadata
    // and external JSON still block below; absence of a payload alone is not
    // proof that a routing subtree is empty.
    if (
      tile.internal.hasContent === false &&
      !tile.internal.hasRenderableContent &&
      !tile.internal.hasUnrenderableContent &&
      !tile.children?.length
    )
      return [];
    const fallback = isLoadedMesh(tile) ? [tile] : null;
    if (tile.refine !== "REPLACE") return null;
    if (
      fallback &&
      !requiredAncestors.has(tile) &&
      errorPixels(tile) <= requestedError
    )
      return fallback;
    if (
      tile.internal.hasUnrenderableContent &&
      tile.internal.loadingState !== LOADED
    )
      return null;
    const children = (tile.children ?? []).filter(
      (child) => !child.traversal || inView(child)
    );
    // A loose parent volume may hit the corridor while every known child
    // misses it. That is complete empty coverage, not a reason to retain a
    // coarse caster indefinitely. Unknown child traversal remains above.
    if (children.length === 0)
      return (tile.children?.length ?? 0) > 0 ? [] : fallback;
    const selected: Tile[] = [];
    let blocker: Tile | undefined;
    for (const child of children) {
      const cut = select(child);
      if (!cut) {
        if (!onWait) return fallback;
        blocker ??= child;
      } else selected.push(...cut);
    }
    if (blocker) {
      for (const child of selected) onWait?.(child, blocker);
      return fallback;
    }
    return selected;
  };
  const result = new Set<Tile>();
  for (const tile of proposed) {
    // A streaming input may contain both the retained parent and new children.
    // Select that family once, from its parent; visiting children independently
    // would bypass the complete-sibling proof and create overlapping surfaces.
    if (
      [...ancestors(tile)].some(
        (parent) => parent.refine === "REPLACE" && proposed.has(parent)
      )
    )
      continue;
    const cut = inView(tile) ? select(tile) : null;
    for (const selected of cut ?? [tile]) result.add(selected);
  }
  return result;
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
    for (const parent of ancestors(tile)) {
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
 * still use upstream selection. No ancestor and descendant are returned
 * together in a REPLACE family, so retaining detail cannot create a second surface.
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
    for (const parent of ancestors(tile)) {
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
    for (const parent of ancestors(tile)) {
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
    const parents = [...ancestors(tile)];
    if (parents.some((parent) => rejected.has(parent))) {
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
    // A partial descendant proposal is not coverage. Keep the previously
    // published tile and discard those descendants atomically to avoid drawing
    // an ancestor and descendant together in one REPLACE family.
    removeDescendants(tile);
    addResult(tile);
  }
  return result;
};
