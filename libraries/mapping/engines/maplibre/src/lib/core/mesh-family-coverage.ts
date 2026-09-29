import type { Tile } from "3d-tiles-renderer/core";
import {
  createMeshRegionCutQuery,
  isLoadedMesh,
  isMeshTileUnconditionallyRefined,
  LOADED,
} from "./mesh-tile-coverage";

/** A replacement owns the complete next drawable generation, including
 * off-camera siblings. Routing JSON is transparent; unknown topology is not
 * coverage. Queries share only per-selection memoization, never mutable tiles.
 */
export const createMeshFamilyCoverage = (
  ready: (tile: Tile) => boolean = isLoadedMesh
) => {
  const region = createMeshRegionCutQuery(
    { has: ready },
    Number.MAX_VALUE,
    () => ({
      intersects: true,
      errorPixels: 0,
    })
  );
  return (parent: Tile) => {
    const support = new Set<Tile>();
    const unpreparedParents = new Set<Tile>();
    const collect = (tile: Tile, owner: Tile) => {
      if (!tile.internal || !tile.traversal) {
        unpreparedParents.add(owner);
        support.add(tile);
        return;
      }
      if (
        tile.internal.hasUnrenderableContent &&
        tile.internal.loadingState !== LOADED
      ) {
        support.add(tile);
        return;
      }
      if (
        tile.internal.hasRenderableContent &&
        !isMeshTileUnconditionallyRefined(tile)
      ) {
        support.add(tile);
        return;
      }
      for (const child of tile.children ?? []) collect(child, tile);
    };
    for (const child of parent.children ?? []) {
      const resident = region(child);
      // A complete finer cut already satisfies this branch. Pin that cut;
      // reloading its discarded parent would add no coverage.
      if (resident) for (const member of resident) support.add(member);
      else collect(child, parent);
    }
    return {
      ready:
        (parent.children?.length ?? 0) > 0 &&
        parent.children.every((child) => region(child) !== null),
      support,
      unpreparedParents,
    };
  };
};
