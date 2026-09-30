import type { Tile } from "3d-tiles-renderer/core";
import type { TileBytesPredictor } from "./three-tiles-byte-prediction";
import type { ThreeTilesRuntimeServices } from "./three-tiles-runtime-context";
import type { RuntimeLruCache, RuntimeTile } from "./three-tiles-runtime-types";
import {
  LOADED_LOADING_STATE,
  resolveTileContentUrl,
} from "./three-tiles-runtime-vendor";

/** Read only when a settled recovery deadline is due, never on the frame hot path. */
export const readMemoryProbeFacts = (
  cache: RuntimeLruCache,
  frontier: Iterable<Tile>,
  predictor: TileBytesPredictor,
  demand: ThreeTilesRuntimeServices["getTileCameraDemand"],
  nextErrorRatio: number
): { residentBytes: number; minimumProbeBytes: number } => {
  let residentBytes = 0;
  let minimumProbeBytes = predictor.globalEstimate();
  for (const tile of cache.itemList) {
    if (
      tile.internal?.loadingState === LOADED_LOADING_STATE &&
      (tile as RuntimeTile).engineData?.scene
    )
      residentBytes += cache.getMemoryUsage(tile);
  }
  // Offscreen/base parents and already-sufficient families do not consume the
  // active cameras' probe slot. With unknown demand retain one predicted tile.
  for (const parent of frontier) {
    const need = demand(parent as RuntimeTile, true);
    if (!need.required || need.errorRatio <= nextErrorRatio) continue;
    let familyBytes = 0;
    const children = [...parent.children];
    for (const child of children) {
      if (child.internal?.hasUnrenderableContent && child.children.length)
        children.push(...child.children);
      else if (
        child.internal?.loadingState !== LOADED_LOADING_STATE ||
        !(child as RuntimeTile).engineData?.scene
      )
        familyBytes += predictor.predict({
          url: resolveTileContentUrl(child),
          geometricError: child.geometricError,
          isExternalTileset: child.internal?.hasUnrenderableContent,
        });
    }
    minimumProbeBytes = Math.max(minimumProbeBytes, familyBytes);
  }
  return { residentBytes, minimumProbeBytes };
};
