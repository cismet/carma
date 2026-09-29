import type { Tile } from "3d-tiles-renderer/core";
import { LOADED, isMeshTileUnconditionallyRefined } from "./mesh-tile-coverage";

/** A whole-region reserve compatible with already chosen finer surfaces.
 * Refine only forced ancestors; each other branch stops at its first drawable
 * payload. Unknown metadata is demand, never evidence of an empty region.
 */
export function selectMeshShadowReserve(
  roots: readonly Tile[],
  refined: ReadonlySet<Tile>,
  ready: (tile: Tile) => boolean,
  exhausted: (tile: Tile) => boolean = () => false
) {
  const frontier = new Set<Tile>();
  const support = new Set<Tile>();
  const unpreparedParents = new Set<Tile>();
  let totalKnown = roots.length > 0;
  const visit = (tile: Tile, owner = tile.parent): boolean => {
    const internal = tile.internal;
    if (!internal || !tile.traversal) {
      totalKnown = false;
      // Native preprocessing assigns parent links. Until then, traversal owns
      // that relationship and must schedule preparation on the known owner.
      if (owner) unpreparedParents.add(owner);
      return false;
    }
    const children = tile.children ?? [];
    if (
      internal.hasUnrenderableContent &&
      (internal.loadingState !== LOADED || children.length === 0)
    ) {
      totalKnown = false;
      support.add(tile);
      return false;
    }
    if (
      internal.hasRenderableContent &&
      !isMeshTileUnconditionallyRefined(tile)
    ) {
      if (!refined.has(tile) || tile.refine === "ADD") {
        if (ready(tile)) {
          frontier.add(tile);
          if (!refined.has(tile)) return true;
        } else if (!exhausted(tile) || tile.refine === "ADD") {
          support.add(tile);
          return false;
        }
      }
    }
    if (!children.length) {
      if (
        !internal.hasContent &&
        !internal.hasRenderableContent &&
        !internal.hasUnrenderableContent
      )
        return true;
      totalKnown = false;
      return false;
    }
    let complete = true;
    for (const child of children) complete = visit(child, tile) && complete;
    return complete;
  };
  let covered = 0;
  for (const root of roots) if (visit(root)) covered++;
  return {
    frontier,
    support,
    unpreparedParents,
    known: roots.length,
    covered,
    totalKnown,
    ready: totalKnown && covered === roots.length,
  };
}
