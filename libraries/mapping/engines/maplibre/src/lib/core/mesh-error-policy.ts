import { TILES_LOAD_POLICY } from "./tile-load-config";

export const DEFAULT_MESH_BASE_ERROR_PIXELS = 16;

/**
 * Error target of the first pass over a terrain-providing tileset: coarse
 * coverage before refinement to the requested target. Cesium's equivalent is
 * its progressive-resolution pass, maximum error / progressiveResolutionHeightFraction.
 */
export const initialMeshLoadError = (
  requested: number,
  base: number = DEFAULT_MESH_BASE_ERROR_PIXELS,
  firstImage = false,
  firstImageTarget: number = TILES_LOAD_POLICY.firstImageMaxErrorPixels
): number => Math.max(base, requested, firstImage ? firstImageTarget : 0);

/** Shared hard-shadow stages; final target readiness is tested separately. */
export const meshShadowStageError = (
  actualErrorPixels: number,
  targetErrorPixels: number
): number => {
  if (
    !Number.isFinite(actualErrorPixels) ||
    !Number.isFinite(targetErrorPixels) ||
    targetErrorPixels <= 0
  )
    return Number.POSITIVE_INFINITY;
  return actualErrorPixels <= targetErrorPixels
    ? targetErrorPixels
    : Math.max(targetErrorPixels, 2 ** Math.ceil(Math.log2(actualErrorPixels)));
};

export type MeshLoadStage = Readonly<{
  current: number;
  total: number;
  stable: boolean;
}>;

/** 16 px, 8 px, ... target define the user-visible progressive mesh stages. */
export const getMeshLoadStage = (
  actualErrorPixels: number,
  targetErrorPixels: number
): MeshLoadStage => {
  if (
    !Number.isFinite(actualErrorPixels) ||
    !Number.isFinite(targetErrorPixels) ||
    targetErrorPixels <= 0
  ) {
    return { current: 0, total: 0, stable: false };
  }
  const initialError = initialMeshLoadError(targetErrorPixels);
  const total = Math.ceil(Math.log2(initialError / targetErrorPixels)) + 1;
  const remaining = Math.max(
    0,
    Math.ceil(
      Math.log2(
        Math.max(actualErrorPixels, targetErrorPixels) / targetErrorPixels
      )
    )
  );
  const stable = actualErrorPixels <= targetErrorPixels;
  return {
    current: stable ? total : Math.max(0, total - remaining),
    total,
    stable,
  };
};

export const resolveExtentGeometricError = (
  levels: ReadonlyArray<{
    level: number;
    geometricError: number;
    bytes: number;
  }>,
  ceilingBytes: number,
  /**
   * Residual quality as a geometric error: the floor never goes finer than
   * this (see tilesetMinResolutionGeometricError), whatever memory allows.
   */
  minResolutionGeometricError = 0
): number => {
  const sorted = [...levels].sort((a, b) => a.level - b.level);
  if (sorted.length === 0)
    return minResolutionGeometricError > 0
      ? minResolutionGeometricError
      : Number.POSITIVE_INFINITY;
  let cumulative = 0;
  // The entry hint accelerates metadata discovery; it cannot reserve more
  // resident payload than the budget. Fall back to the coarsest available cut.
  let chosen = sorted[0];
  for (const level of sorted) {
    cumulative +=
      level.bytes * TILES_LOAD_POLICY.extentResidentBytesPerTransferByte;
    if (cumulative > ceilingBytes * TILES_LOAD_POLICY.extentMemoryShare) break;
    if (level.geometricError < minResolutionGeometricError) break;
    chosen = level;
  }
  return chosen?.geometricError ?? Number.POSITIVE_INFINITY;
};

/**
 * Residual quality codified as a resolution: the whole extent shown across
 * `tilesetMinResolutionPx` pixels at the base error target. A tile of
 * geometric error g then shows `g × px / longestAxis` pixels of error, so
 * the floor is the coarsest level whose error is at most base × axis / px.
 */
export const tilesetMinResolutionGeometricError = (
  baseErrorTargetPixels: number,
  rootLongestAxisMeters: number,
  tilesetMinResolutionPx: number
): number =>
  Number.isFinite(rootLongestAxisMeters) &&
  rootLongestAxisMeters > 0 &&
  tilesetMinResolutionPx > 0
    ? (baseErrorTargetPixels * rootLongestAxisMeters) / tilesetMinResolutionPx
    : 0;

/** At or above the level the whole extent stays resident at. */
export const isExtentFloorTile = (
  tile: { geometricError: number },
  extentGeometricError: number
): boolean => tile.geometricError >= extentGeometricError;

/**
 * Screen-space error a tile in ring k (1 = innermost) may stop at, with the
 * anchor refined towards the visible target, preserving the ring spacing.
 */
export const idleRingAllowedError = (
  baseErrorTarget: number,
  ring: number,
  refinedLevels: number,
  visibleErrorTarget: number
): number => {
  // Preserve one coarser level per band even after idle refinement settles.
  // Decision: TILES_COVERAGE.md#persistent-offscreen-lod-gradient
  const initialAnchor =
    TILES_LOAD_POLICY.idleRingAnchorPixels ?? baseErrorTarget;
  const anchor = Math.max(
    visibleErrorTarget,
    initialAnchor / 2 ** Math.max(0, refinedLevels)
  );
  const levels = Math.max(1, ring) * TILES_LOAD_POLICY.idleRingLevelStep;
  return anchor * 2 ** levels;
};
