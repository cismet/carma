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

const coversWholeTile = (
  id: TerrainTileId,
  descendants: readonly FrontierTile[]
): boolean => {
  if (descendants.some((tile) => terrainTileContains(tile.id, id))) return true;
  const inside = descendants.filter((tile) => terrainTileContains(id, tile.id));
  if (!inside.length) return false;
  for (let y = 0; y < 2; y += 1)
    for (let x = 0; x < 2; x += 1)
      if (
        !coversWholeTile(
          { level: id.level + 1, x: id.x * 2 + x, y: id.y * 2 + y },
          inside
        )
      )
        return false;
  return true;
};

/**
 * A non-overlapping quadtree cut. Replace equal tiles immediately, but retire a
 * coarse tile only when ready descendants cover its entire spatial footprint,
 * not merely the requested/view-visible subset. Historical offscreen coverage
 * stays until an actual replacement covers it too; changing demand is not proof
 * that removing a surface is safe during the next pan or zoom.
 */
export const advanceTerrainTileFrontier = (
  current: readonly FrontierTile[],
  requested: readonly FrontierTile[],
  isReady: (key: string) => boolean,
  canCoarsen: (key: string) => boolean = () => true
): FrontierTile[] => {
  let frontier = [...current];
  const ready = requested.filter((tile) => isReady(tile.key));
  const readyCut = ready.filter(
    (tile, index) =>
      !ready.some(
        (other, otherIndex) =>
          terrainTileContains(other.id, tile.id) &&
          (other.id.level < tile.id.level || otherIndex > index)
      )
  );
  for (const candidate of readyCut) {
    const covered = frontier.filter((tile) => overlaps(tile, candidate));
    if (
      covered.some(
        (tile) => tile.id.level > candidate.id.level && !canCoarsen(tile.key)
      )
    )
      continue;
    const ancestor = covered.find((tile) => tile.id.level < candidate.id.level);
    const replacements = ancestor
      ? readyCut.filter((tile) => terrainTileContains(ancestor.id, tile.id))
      : [candidate];
    if (ancestor && !coversWholeTile(ancestor.id, replacements)) continue;
    frontier = frontier.filter(
      (tile) => !replacements.some((replacement) => overlaps(tile, replacement))
    );
    frontier.push(...replacements);
  }
  return frontier;
};
