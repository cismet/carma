import type { Tile } from "3d-tiles-renderer/core";
import { isExtentFloorTile } from "./mesh-error-policy";
import {
  isMeshCoveredByLoadedChildren,
  isMeshTileUnconditionallyRefined,
} from "./mesh-tile-coverage";

export const TILE_REQUEST_NEED = {
  COVERAGE: "viewport-coverage",
  EXTENT: "extent-reserve",
  MOTION: "motion-prefetch",
  ZOOM: "zoom-prefetch",
  SUPPORT: "visible-refinement",
  IDLE: "idle-reserve",
  CAMERA: "camera-demand",
  SHADOW: "shadow-demand",
  METADATA: "subtree-metadata",
  VIEW: "view-or-margin",
} as const;

/** Facts about our demand policy; Tile remains the upstream data model.
 * Readers must describe one current-view snapshot and must not change tiles.
 * They stay lazy so an early coverage decision needs no shadow geometry query.
 */
export type TileRequestNeedContext = Readonly<{
  coverageRecovery: boolean;
  extentFloorArmed: boolean;
  extentGeometricError: number;
  motionPrefetch: boolean;
  zoomPrefetch: boolean;
  zooming: boolean;
  moving: boolean;
  providesTerrain: boolean;
  baseCoverageReady: boolean;
  mainViewConverged: boolean;
  effectiveErrorTarget: number;
  requestedErrorTarget: number;
  memoryErrorTarget: number;
  idleRing: boolean;
  shadowSelection: boolean;
  shadowView: boolean;
  refinementSupport: ReadonlySet<Tile>;
  residentAncestors: ReadonlySet<Tile>;
  visibleTiles: ReadonlySet<Tile>;
  coverageNeeded: (tile: Tile) => boolean;
  motionNeeded: (tile: Tile) => boolean;
  inMainView: (tile: Tile) => boolean;
  inPrefetchMargin: (tile: Tile) => boolean;
  screenError: (tile: Tile) => number;
  cameraDemand: (
    tile: Tile
  ) => Readonly<{ required: boolean; errorRatio: number }>;
  shadowReceiverError: (tile: Tile) => number | null;
}>;

/** Explain why this request still contributes; null releases stale work.
 * Admission/parking and aborting native jobs are separate decisions/adapters.
 */
export const resolveTileRequestNeed = (
  tile: Tile,
  context: TileRequestNeedContext
) => {
  if (context.coverageRecovery && context.coverageNeeded(tile))
    return TILE_REQUEST_NEED.COVERAGE;
  if (
    context.extentFloorArmed &&
    isExtentFloorTile(tile, context.extentGeometricError)
  )
    return TILE_REQUEST_NEED.EXTENT;
  if (context.motionPrefetch && context.motionNeeded(tile))
    return TILE_REQUEST_NEED.MOTION;
  const inView = context.inMainView(tile);
  if (context.zoomPrefetch && context.zooming && inView)
    return TILE_REQUEST_NEED.ZOOM;
  if (inView && context.refinementSupport.has(tile))
    return TILE_REQUEST_NEED.SUPPORT;
  if (
    context.providesTerrain &&
    isMeshCoveredByLoadedChildren(tile, context.visibleTiles)
  )
    return null;
  if (
    !context.moving &&
    context.baseCoverageReady &&
    context.mainViewConverged &&
    context.effectiveErrorTarget === context.requestedErrorTarget &&
    (context.idleRing || context.residentAncestors.has(tile))
  )
    return TILE_REQUEST_NEED.IDLE;
  let parent = tile.parent;
  while (
    parent &&
    (!parent.internal?.hasRenderableContent ||
      isMeshTileUnconditionallyRefined(parent))
  )
    parent = parent.parent;
  const replacementParent = parent?.refine === "REPLACE" ? parent : null;
  if (
    context.cameraDemand(tile).required &&
    (!replacementParent ||
      context.cameraDemand(replacementParent).errorRatio > 1)
  )
    return TILE_REQUEST_NEED.CAMERA;
  if (!inView && context.shadowSelection) {
    const receiverError = context.shadowReceiverError(tile);
    if (
      receiverError !== null &&
      (!replacementParent || replacementParent.geometricError > receiverError)
    )
      return TILE_REQUEST_NEED.SHADOW;
  } else if (!inView && context.shadowView && !context.shadowSelection)
    return TILE_REQUEST_NEED.SHADOW;
  if (tile.internal.hasUnrenderableContent) return TILE_REQUEST_NEED.METADATA;
  return (inView || context.inPrefetchMargin(tile)) &&
    (!replacementParent ||
      context.screenError(replacementParent) >
        Math.max(context.requestedErrorTarget, context.memoryErrorTarget))
    ? TILE_REQUEST_NEED.VIEW
    : null;
};
