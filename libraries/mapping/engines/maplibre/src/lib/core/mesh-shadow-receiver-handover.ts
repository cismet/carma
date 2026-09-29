import type { Tile } from "3d-tiles-renderer/core";
import { meshTileAncestors } from "./mesh-tile-coverage";

/** Publish independent ready families; keep an existing parent until the
 * proposed receiver and its complete compatible caster cut can appear together.
 * Readiness inspects the proposed cut, so dependent families can advance in
 * one transaction rather than waiting on one another's previous publication.
 */
export function holdMeshReceiversForCasters(
  proposed: ReadonlySet<Tile>,
  previous: ReadonlySet<Tile>,
  ready: (tile: Tile) => boolean
) {
  const heldParents = new Set<Tile>();
  const receivers = new Set<Tile>();
  for (const tile of proposed) {
    if (previous.has(tile) || ready(tile)) receivers.add(tile);
    else {
      for (const parent of meshTileAncestors(tile)) {
        if (!previous.has(parent)) continue;
        heldParents.add(parent);
        break;
      }
    }
  }
  for (const tile of receivers)
    for (const parent of meshTileAncestors(tile))
      if (heldParents.has(parent)) {
        receivers.delete(tile);
        break;
      }
  for (const parent of heldParents) receivers.add(parent);
  return {
    receivers,
    pending: new Set([...proposed].filter((tile) => !receivers.has(tile))),
  };
}
