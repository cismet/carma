import type { TerrainTileId } from "../../core/raster-dem-tile";

/** All XYZ tiles at the declared minimum source level are independent roots.
 * A fine cached node may only outlive its parent if the source cannot supply it.
 */
export const terrainCacheTree = (
  identity: string,
  id: TerrainTileId,
  minimumSourceLevel = 0
) => ({
  identity,
  node: `${id.level}/${id.x}/${id.y}`,
  parent:
    id.level <= minimumSourceLevel
      ? null
      : `${id.level - 1}/${Math.floor(id.x / 2)}/${Math.floor(id.y / 2)}`,
  level: id.level,
});
