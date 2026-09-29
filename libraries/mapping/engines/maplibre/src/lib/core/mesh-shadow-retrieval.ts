import type { Tile } from "3d-tiles-renderer/core";
import { createMeshFamilyCoverage } from "./mesh-family-coverage";
import {
  isLoadedMesh,
  isMeshTileUnconditionallyRefined,
  meshTileAncestors,
  LOADED,
} from "./mesh-tile-coverage";

/** Count drawable mesh generations, excluding external JSON/container nodes. */
export const meshContentLevel = (tile: Tile): number => {
  let level = -1;
  for (let current: Tile | null = tile; current; current = current.parent)
    if (
      current.internal?.hasRenderableContent &&
      !isMeshTileUnconditionallyRefined(current)
    )
      level++;
  return Math.max(0, level);
};

/** One hierarchy query for the union of visible receivers' parallel sun rays.
 * Receivers are fixed anchors, not another selection to negotiate with shadows.
 * Tile identity deduplicates overlapping corridors and shares native requests.
 */
export function selectMeshShadowRetrieval(
  root: Tile,
  receivers: ReadonlySet<Tile>,
  previous: ReadonlySet<Tile>,
  targetError: number,
  demand: (tile: Tile) => {
    intersects: boolean;
    errorPixels: number;
    receiverGeometricError: number;
    receiverContentLevel?: number;
  }
) {
  const familyCoverage = createMeshFamilyCoverage();
  const receiverAncestors = new Set<Tile>();
  const retainedAncestors = new Set<Tile>();
  const requests = new Set<Tile>();
  const support = new Set<Tile>();
  const unpreparedParents = new Set<Tile>();
  for (const tile of receivers)
    for (const parent of meshTileAncestors(tile)) receiverAncestors.add(parent);
  for (const tile of previous) {
    // Receiver publication carries this same floor through a role change.
    // Never forget finer caster history just because its parent enters view.
    for (const parent of meshTileAncestors(tile)) retainedAncestors.add(parent);
  }
  type Cut = {
    tiles: Tile[];
    complete: boolean;
    converged: boolean;
    missing?: Tile[];
  };
  const visit = (tile: Tile): Cut => {
    const wanted = demand(tile);
    if (receivers.has(tile)) {
      // Visible geometry is still loaded by the observer. If it casts into a
      // finer receiver, that same path refines it; never draw a second mesh or
      // bypass the caster LOD floor just because this tile is already visible.
      const ready =
        meshContentLevel(tile) >= (wanted.receiverContentLevel ?? -1);
      return {
        tiles: ready ? [tile] : [],
        complete: ready,
        converged: ready,
        missing: ready ? [] : [tile],
      };
    }
    const anchored = receiverAncestors.has(tile);
    if (!anchored && !wanted.intersects)
      return { tiles: [], complete: true, converged: true };
    if (!tile.internal || !tile.traversal) {
      if (tile.parent) unpreparedParents.add(tile.parent);
      return { tiles: [], complete: false, converged: false, missing: [tile] };
    }
    const internal = tile.internal;
    const children = tile.children ?? [];
    if (internal.hasUnrenderableContent && internal.loadingState !== LOADED) {
      requests.add(tile);
      return { tiles: [], complete: false, converged: false, missing: [tile] };
    }
    const content =
      internal.hasRenderableContent && !isMeshTileUnconditionallyRefined(tile);
    // This is a publication floor, including retained/leaf/fallback content.
    // A caster shared by receivers must meet the strictest receiver it affects.
    const eligible =
      content &&
      !anchored &&
      ((wanted.receiverContentLevel ?? -1) >= 0
        ? meshContentLevel(tile) >= wanted.receiverContentLevel!
        : tile.geometricError <= wanted.receiverGeometricError);
    const loaded = eligible && isLoadedMesh(tile);
    const refine =
      anchored ||
      retainedAncestors.has(tile) ||
      !content ||
      !eligible ||
      ((wanted.receiverContentLevel ?? -1) < 0 &&
        wanted.errorPixels > targetError);
    if (content && !anchored && (!refine || children.length === 0)) {
      if (eligible && !loaded) requests.add(tile);
      return {
        tiles: loaded ? [tile] : [],
        complete: loaded,
        converged: loaded,
        missing: loaded ? [] : [tile],
      };
    }
    if (children.length === 0)
      return {
        tiles: [],
        complete: !internal.hasContent,
        converged: !internal.hasContent,
        missing: internal.hasContent ? [tile] : [],
      };
    // Raw native children do not have parent links yet. Ask their known
    // parent to prepare them rather than leaving this branch permanently pending.
    if (children.some((child) => !child.internal || !child.traversal))
      unpreparedParents.add(tile);
    const family =
      content &&
      tile.refine === "REPLACE" &&
      (anchored ||
        eligible ||
        meshContentLevel(tile) + 1 >= (wanted.receiverContentLevel ?? -1))
        ? familyCoverage(tile)
        : null;
    if (family) {
      for (const member of family.support) {
        // Decoded siblings remain owned while the rest of this family loads.
        // Otherwise cleanup can evict them before they enter the caster cut.
        if (!family.ready) support.add(member);
        if (!receivers.has(member) && !isLoadedMesh(member))
          requests.add(member);
      }
      for (const owner of family.unpreparedParents)
        unpreparedParents.add(owner);
    }
    const cuts = children.map(visit);
    const complete =
      (family?.ready ?? true) && cuts.every((cut) => cut.complete);
    const descendants = cuts.flatMap((cut) => cut.tiles);
    // Do not download a coarser intermediate caster. A retained replacement
    // can bridge refinement only while it still meets every current receiver.
    if (eligible && !loaded && !complete) requests.add(tile);
    if (tile.refine === "ADD" && content && !anchored) {
      if (eligible && !loaded) requests.add(tile);
      return {
        tiles: loaded ? [tile, ...descendants] : descendants,
        complete: loaded && complete,
        converged: loaded && cuts.every((cut) => cut.converged),
        missing: [
          ...(loaded ? [] : [tile]),
          ...cuts.flatMap((cut) => cut.missing ?? []),
        ],
      };
    }
    // REPLACE publishes one complete demanded family at a time. No parent is
    // superimposed with its children, and failed loads never count as coverage.
    const parentFallback = loaded && !retainedAncestors.has(tile);
    const familyMissing =
      family && !family.ready
        ? [...family.support].filter((member) => !isLoadedMesh(member))
        : [];
    return {
      // A new family may keep its previous parent while loading. Once finer
      // casters were published, missing neighbours cannot resurrect that parent.
      tiles:
        !complete && parentFallback
          ? [tile]
          : family && !family.ready && !retainedAncestors.has(tile)
          ? []
          : descendants,
      complete: complete || parentFallback,
      converged: complete && cuts.every((cut) => cut.converged),
      missing: parentFallback
        ? []
        : [...familyMissing, ...cuts.flatMap((cut) => cut.missing ?? [])],
    };
  };
  const cut = visit(root);
  return {
    requests,
    support,
    unpreparedParents,
    casters: new Set(cut.tiles),
    converged: cut.converged,
    missing: cut.missing ?? [],
  };
}
