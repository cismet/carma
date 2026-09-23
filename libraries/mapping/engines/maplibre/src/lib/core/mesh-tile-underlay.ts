import type { Tile } from "3d-tiles-renderer/core";
import { isLoadedMesh } from "./mesh-tile-coverage";

/**
 * Loaded REPLACE ancestors of the displayed cut that still have an in-view
 * child without any displayed descendant: that quadrant is a hole. Drawn
 * underneath the finer tiles that exist, the ancestor fills uncovered branches
 * until their content arrives. Parent depth writes stay disabled, so coarse
 * relief cannot occlude the newly published detail.
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
    if (ancestor.refine !== "REPLACE") continue;
    if (displayed.has(ancestor) && !refined.has(ancestor)) continue;
    if (!isLoadedMesh(ancestor) || !ready(ancestor) || !inView(ancestor))
      continue;
    if (hasHole(ancestor)) underlay.add(ancestor);
  }
  // Keep only the finest loaded ancestor per hole: drop any underlay that has
  // another underlay below it. The extent floor stays: a finer underlay
  // below it covers one hole, not the floor tile's whole region.
  for (const tile of [...underlay])
    for (let parent = tile.parent; parent; parent = parent.parent)
      if (
        underlay.has(parent) &&
        !floorSet.has(parent) &&
        !displayed.has(parent)
      )
        underlay.delete(parent);
  return underlay;
};
