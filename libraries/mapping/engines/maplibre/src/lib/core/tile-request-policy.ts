import { clamp } from "@carma-commons/math";

import { TILES_LOAD_POLICY } from "./tile-load-config";

const FAILED_LOADING_STATE = -1;
const UNLOADED_LOADING_STATE = 0;

export const TILE_PRIORITY = {
  maxDepth: 63,
  depthStep: 1_000,
  externalTilesetBonus: 500,
  centernessWeight: 100,
  shadowLightFacingWeight: 50,
} as const;

const MAIN_FRUSTUM_PRIORITY_BONUS =
  (TILE_PRIORITY.maxDepth + 1) * TILE_PRIORITY.depthStep +
  TILE_PRIORITY.externalTilesetBonus +
  TILE_PRIORITY.centernessWeight +
  TILE_PRIORITY.shadowLightFacingWeight;

export type TilePriorityInput = Readonly<{
  /** Mesh admission: distance to the camera in the current traversal, in metres. */
  distanceFromCamera?: number;
  depth: number;
  inMainFrustum: boolean;
  isExternalTileset: boolean;
  /** Missing viewport coverage, ahead of detail upgrades and caster-only work. */
  fillsViewCoverage?: boolean;
  /** Visible refinement needed to reach the first usable quality target. */
  improvesInitialView?: boolean;
  /** Extent floor reserve; outside the view it follows visible refinement. */
  isExtentFloor?: boolean;
  /** 1 at the view centre, 0 at the edge (or unknown). */
  centerness: number;
  /**
   * Foveation: within a lane a tile sorts as if `1 + weight × (1 − centerness)`
   * times farther, so the view centre refines first (Cesium's foveated error,
   * applied to the order of requests, not to what is loaded).
   */
  foveationWeight?: number;
  /** View-centre relevance of the visible receiver for a shadow-only tile. */
  shadowReceiverCenterness?: number;
  /** 1 at the light-facing end of the relevant receiver sweep. */
  shadowLightFacing?: number;
}>;

/** Higher values download first (upstream pops from the end of the queue). */
export const deriveTilePriority = (input: TilePriorityInput): number => {
  if (input.distanceFromCamera !== undefined) {
    const distance = Number.isFinite(input.distanceFromCamera)
      ? Math.max(0, input.distanceFromCamera)
      : Number.MAX_VALUE;
    // Metadata and missing visible coverage first. A proven sun-corridor
    // dependency comes before cosmetic receiver refinement, otherwise detail
    // can starve the offscreen geometry needed for the first correct shadow.
    // Within a lane, keep nearest-first ordering independent of tree depth.
    const lane = input.isExternalTileset
      ? 6
      : input.inMainFrustum
      ? input.fillsViewCoverage
        ? 5
        : input.improvesInitialView
        ? 4
        : 2
      : Number.isFinite(input.shadowReceiverCenterness)
      ? 3
      : input.isExtentFloor
      ? 1
      : 0;
    const foveation = Math.max(0, input.foveationWeight ?? 0);
    const centered = clamp(
      Number.isFinite(input.centerness) ? input.centerness : 0,
      0,
      1
    );
    return lane + 1 / (1 + distance * (1 + foveation * (1 - centered)));
  }
  const depth = clamp(Math.floor(input.depth), 0, TILE_PRIORITY.maxDepth);
  const requestedCenterness = input.inMainFrustum
    ? input.centerness
    : input.shadowReceiverCenterness ?? input.centerness;
  const centerness = clamp(
    Number.isFinite(requestedCenterness) ? requestedCenterness : 0,
    0,
    1
  );
  const shadowLightFacing = clamp(
    Number.isFinite(input.shadowLightFacing) ? input.shadowLightFacing ?? 0 : 0,
    0,
    1
  );
  return (
    (TILE_PRIORITY.maxDepth + 1 - depth) * TILE_PRIORITY.depthStep +
    (input.isExternalTileset ? TILE_PRIORITY.externalTilesetBonus : 0) +
    (input.inMainFrustum ? MAIN_FRUSTUM_PRIORITY_BONUS : 0) +
    centerness * TILE_PRIORITY.centernessWeight +
    (input.inMainFrustum
      ? 0
      : shadowLightFacing * TILE_PRIORITY.shadowLightFacingWeight)
  );
};

export type TileDeferralDecision = "defer" | "undefer" | "keep";

export type TileDeferralInput = Readonly<{
  /** Renderable REPLACE content that is not unconditionally refined. */
  displayable: boolean;
  inView: boolean;
  inMargin: boolean;
  loadingState: number;
  isDeferred: boolean;
}>;

export const shouldDeferTile = (
  input: TileDeferralInput
): TileDeferralDecision => {
  if (input.inView || input.inMargin) {
    return input.isDeferred ? "undefer" : "keep";
  }
  if (
    input.displayable &&
    input.loadingState === UNLOADED_LOADING_STATE &&
    !input.isDeferred
  ) {
    return "defer";
  }
  return "keep";
};

/** Loading state that makes a deferred tile count as finished for its parent. */
export const DEFERRED_TILE_LOADING_STATE = FAILED_LOADING_STATE;

export const resolveRequestConcurrency = (input: {
  memoryPressure?: boolean;
  configured: number;
  ceilingBytes: number;
  cachedBytes: number;
  estimateBytes: number;
}): number => {
  if (input.memoryPressure) return 0;
  const configured = Math.floor(input.configured);
  if (!Number.isFinite(configured) || configured <= 0) return 0;
  const headroom = Math.max(0, input.ceilingBytes - input.cachedBytes);
  const estimate = Math.max(1, input.estimateBytes);
  const admissible = Math.floor(headroom / estimate);
  const upperBound = Math.min(
    configured,
    TILES_LOAD_POLICY.maximumRequestConcurrency
  );
  const lowerBound = Math.min(
    configured,
    TILES_LOAD_POLICY.minimumRequestConcurrency
  );
  return clamp(Math.min(configured, admissible), lowerBound, upperBound);
};

/** Geometric error of the deepest level the extent stays resident at. */
