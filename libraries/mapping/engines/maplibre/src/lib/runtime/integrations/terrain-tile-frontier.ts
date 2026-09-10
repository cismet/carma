import type { TerrainTileId } from "../../core/raster-dem-tile";

type FrontierTile = Readonly<{ key: string; id: TerrainTileId }>;

export const terrainTileContains = (
  ancestor: TerrainTileId,
  descendant: TerrainTileId
) => {
  if (ancestor.level > descendant.level) return false;
  const shift = descendant.level - ancestor.level;
  return (
    descendant.x >> shift === ancestor.x && descendant.y >> shift === ancestor.y
  );
};

const overlaps = (left: FrontierTile, right: FrontierTile) =>
  terrainTileContains(left.id, right.id) ||
  terrainTileContains(right.id, left.id);

/**
 * A non-overlapping quadtree cut. Replace equal tiles immediately, but retire a
 * coarse tile only when its entire requested child group is ready. Failed or
 * still loading children therefore keep their previous receiver/caster surface.
 * Selection pruning must also retain caller-protected visible surfaces; a ready
 * overlapping replacement can still retire them atomically.
 */
export const advanceTerrainTileFrontier = (
  current: readonly FrontierTile[],
  requested: readonly FrontierTile[],
  isReady: (key: string) => boolean,
  pruneOutsideSelection = false,
  retainedKeys?: ReadonlySet<string>
): FrontierTile[] => {
  let frontier = pruneOutsideSelection
    ? current.filter(
        (tile) =>
          retainedKeys?.has(tile.key) ||
          requested.some((entry) => overlaps(tile, entry))
      )
    : [...current];
  for (const candidate of requested) {
    if (!isReady(candidate.key)) continue;
    const covered = frontier.filter((tile) => overlaps(tile, candidate));
    const ancestor = covered.find((tile) => tile.id.level < candidate.id.level);
    const replacements = ancestor
      ? requested.filter((tile) => terrainTileContains(ancestor.id, tile.id))
      : [candidate];
    if (!replacements.every((tile) => isReady(tile.key))) continue;
    frontier = frontier.filter(
      (tile) => !replacements.some((replacement) => overlaps(tile, replacement))
    );
    frontier.push(...replacements);
  }
  return frontier;
};
