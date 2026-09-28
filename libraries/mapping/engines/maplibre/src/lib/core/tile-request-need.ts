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
  SHADOW_HISTORY: "previous-sun-direction",
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
  activeViewsConverged?: boolean;
  effectiveErrorTarget: number;
  requestedErrorTarget: number;
  memoryErrorTarget: number;
  idleRing: boolean;
  shadowSelection: boolean;
  shadowView: boolean;
  shadowCameraDemand?: boolean;
  retainedShadowRequest: boolean;
  refinementSupport: ReadonlySet<Tile>;
  receiverReplacementAncestors: ReadonlySet<Tile>;
  residentAncestors: ReadonlySet<Tile>;
  visibleTiles: ReadonlySet<Tile>;
  coverageNeeded: (tile: Tile) => boolean;
  motionNeeded: (tile: Tile) => boolean;
  inMainView: (tile: Tile) => boolean;
  inPrefetchMargin: (tile: Tile) => boolean;
  screenError: (tile: Tile) => number;
  cameraDemand: (tile: Tile) => Readonly<{
    required: boolean;
    errorRatio: number;
    refinementErrorRatio?: number;
  }>;
  shadowReceiverError: (tile: Tile) => number | null;
}>;

/** Explain why this request still contributes; null releases stale work.
 * Admission/parking and aborting native jobs are separate decisions/adapters.
 */
export const resolveTileRequestNeed = (
  tile: Tile,
  context: TileRequestNeedContext
) => {
  const retained = context.retainedShadowRequest
    ? TILE_REQUEST_NEED.SHADOW_HISTORY
    : null;
  if (context.coverageRecovery && context.coverageNeeded(tile))
    return TILE_REQUEST_NEED.COVERAGE;
  if (context.motionPrefetch && context.motionNeeded(tile))
    return TILE_REQUEST_NEED.MOTION;
  const inView = context.inMainView(tile);
  if (context.zoomPrefetch && context.zooming && inView)
    return TILE_REQUEST_NEED.ZOOM;
  const cameraDemand = context.cameraDemand(tile);
  const inActiveView = inView || cameraDemand.required;
  if (inActiveView && context.refinementSupport.has(tile))
    return TILE_REQUEST_NEED.SUPPORT;
  if (
    context.providesTerrain &&
    isMeshCoveredByLoadedChildren(tile, context.visibleTiles)
  )
    return retained;
  let parent = tile.parent;
  while (
    parent &&
    (!parent.internal?.hasRenderableContent ||
      isMeshTileUnconditionallyRefined(parent))
  )
    parent = parent.parent;
  const replacementParent = parent?.refine === "REPLACE" ? parent : null;
  // Decision: ../../../TILES_COVERAGE.md#exclusive-shadow-caster-handover
  // A held parent cannot also supply depth after its receiver family switches.
  // Its demanded siblings are handover prerequisites even at a coarser target.
  const receiverReplacement =
    context.shadowView &&
    replacementParent &&
    context.receiverReplacementAncestors.has(replacementParent);
  if (inActiveView && receiverReplacement) return TILE_REQUEST_NEED.SUPPORT;
  const parentCameraDemand = replacementParent
    ? context.cameraDemand(replacementParent)
    : null;
  if (
    cameraDemand.required &&
    (!parentCameraDemand ||
      (parentCameraDemand.refinementErrorRatio ??
        parentCameraDemand.errorRatio) > 1)
  )
    return TILE_REQUEST_NEED.CAMERA;
  if (!context.shadowCameraDemand && !inView && context.shadowSelection) {
    const receiverError = context.shadowReceiverError(tile);
    // Traversal refines the parent's footprint against its strictest receiver.
    // A child can touch only a coarser receiver and still be required for that
    // exclusive family handover. Do not test parent error against child demand.
    if (
      receiverError !== null &&
      (!replacementParent ||
        replacementParent.geometricError >
          (context.shadowReceiverError(replacementParent) ?? receiverError) ||
        receiverReplacement)
    )
      return TILE_REQUEST_NEED.SHADOW;
  } else if (
    !context.shadowCameraDemand &&
    !inView &&
    context.shadowView &&
    !context.shadowSelection
  )
    return TILE_REQUEST_NEED.SHADOW;
  if (tile.internal.hasUnrenderableContent)
    return (!cameraDemand.required && inView) || context.inPrefetchMargin(tile)
      ? TILE_REQUEST_NEED.METADATA
      : retained;
  if (
    !cameraDemand.required &&
    (inView || context.inPrefetchMargin(tile)) &&
    (!replacementParent ||
      context.screenError(replacementParent) >
        Math.max(context.requestedErrorTarget, context.memoryErrorTarget))
  )
    return TILE_REQUEST_NEED.VIEW;
  const idle =
    !context.moving &&
    context.baseCoverageReady &&
    (context.activeViewsConverged ?? context.mainViewConverged) &&
    context.effectiveErrorTarget === context.requestedErrorTarget &&
    context.memoryErrorTarget <= context.requestedErrorTarget;
  if (
    context.extentFloorArmed &&
    isExtentFloorTile(tile, context.extentGeometricError)
  )
    return TILE_REQUEST_NEED.EXTENT;
  if (idle && (context.idleRing || context.residentAncestors.has(tile)))
    return TILE_REQUEST_NEED.IDLE;
  return retained;
};
