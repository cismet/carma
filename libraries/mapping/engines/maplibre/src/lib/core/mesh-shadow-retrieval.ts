import type { Tile } from "3d-tiles-renderer/core";
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

/** Final publication invariant, independent of traversal and cached selections.
 * No ancestor of a visible tile may contribute a second, coarser shadow surface.
 */
export function excludeMeshReceiverAncestors(
  candidates: ReadonlySet<Tile>,
  visible: ReadonlySet<Tile>
): Set<Tile> {
  const ancestors = new Set<Tile>();
  for (const receiver of visible)
    for (const parent of meshTileAncestors(receiver)) ancestors.add(parent);
  return new Set([...candidates].filter((tile) => !ancestors.has(tile)));
}

/** Query only offscreen geometry casting into the fixed visible receiver cut.
 * Metadata is traversed to the receiver's target generation before downloading
 * payloads. Receivers own their complete subtrees; shadows never refine them.
 * Relevant REPLACE families publish atomically without coarse intermediates.
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
  },
  inView: (tile: Tile) => boolean = () => false
) {
  const receiverAncestors = new Set<Tile>();
  const retainedAncestors = new Set<Tile>();
  const requests = new Set<Tile>();
  const support = new Set<Tile>();
  const unpreparedParents = new Set<Tile>();
  const blocked = new Set<Tile>();
  for (const tile of receivers)
    for (const parent of meshTileAncestors(tile)) receiverAncestors.add(parent);
  for (const tile of previous)
    for (const parent of meshTileAncestors(tile)) retainedAncestors.add(parent);
  type Cut = { tiles: Tile[]; complete: boolean; missing: Tile[] };
  const empty = (): Cut => ({ tiles: [], complete: true, missing: [] });
  const visit = (tile: Tile, owner = tile.parent): Cut => {
    // The observer supplies both colour and shadow geometry for this subtree.
    if (receivers.has(tile)) return empty();
    const anchored = receiverAncestors.has(tile);
    const wanted = demand(tile);
    if (!anchored && !wanted.intersects) return empty();
    if (!tile.internal || !tile.traversal) {
      if (owner) unpreparedParents.add(owner);
      return { tiles: [], complete: false, missing: [tile] };
    }
    const internal = tile.internal;
    const children = tile.children ?? [];
    if (internal.hasUnrenderableContent && internal.loadingState !== LOADED) {
      requests.add(tile);
      return { tiles: [], complete: false, missing: [tile] };
    }
    const observerOwned = inView(tile);
    const content =
      internal.hasRenderableContent && !isMeshTileUnconditionallyRefined(tile);
    const level = meshContentLevel(tile);
    const requiredLevel = wanted.receiverContentLevel ?? -1;
    const eligible =
      content &&
      !anchored &&
      !observerOwned &&
      (requiredLevel >= 0
        ? level >= requiredLevel
        : tile.geometricError <= wanted.receiverGeometricError &&
          wanted.errorPixels <= targetError);
    const retained = retainedAncestors.has(tile);
    if (eligible && !retained) {
      support.add(tile);
      if (!isLoadedMesh(tile)) requests.add(tile);
      return {
        tiles: isLoadedMesh(tile) ? [tile] : [],
        complete: isLoadedMesh(tile),
        missing: isLoadedMesh(tile) ? [] : [tile],
      };
    }
    if (!children.length) {
      if (observerOwned || (!internal.hasContent && !content)) return empty();
      blocked.add(tile);
      return { tiles: [], complete: false, missing: [tile] };
    }
    const cuts = children.map((child) => visit(child, tile));
    const complete = cuts.every((cut) => cut.complete);
    const descendants = cuts.flatMap((cut) => cut.tiles);
    const missing = cuts.flatMap((cut) => cut.missing);
    // Ancestors that contain visible receivers are navigation paths, never
    // caster payloads. Only the directly replacing caster family waits together.
    const family =
      content &&
      !anchored &&
      tile.refine === "REPLACE" &&
      (eligible || level + 1 >= requiredLevel);
    if (family && !complete) {
      return { tiles: [], complete: false, missing };
    }
    if (tile.refine === "ADD" && content && !anchored && eligible) {
      support.add(tile);
      if (!isLoadedMesh(tile)) requests.add(tile);
      return {
        tiles: isLoadedMesh(tile) ? [tile, ...descendants] : descendants,
        complete: isLoadedMesh(tile) && complete,
        missing: isLoadedMesh(tile) ? missing : [tile, ...missing],
      };
    }
    return { tiles: descendants, complete, missing };
  };
  const cut = visit(root);
  return {
    requests,
    support,
    unpreparedParents,
    blocked,
    casters: new Set(cut.tiles),
    converged: cut.complete,
    missing: cut.missing,
  };
}
