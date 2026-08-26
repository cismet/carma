export type LightSpaceBounds = Readonly<{
  left: number;
  right: number;
  bottom: number;
  top: number;
  near: number;
  far: number;
}>;

export type LightSpacePoint = readonly [x: number, y: number];

export type ShadowTileLayoutOptions = Readonly<{
  receiverBounds: LightSpaceBounds;
  casterPaddingMeters: number;
  casterReliefMeters: number;
  casterReachMeters: number;
  targetMetersPerTexel: number;
  maxShadowMapDimension: number;
  maxTileCount: number;
}>;

export type ShadowTileBounds = LightSpaceBounds &
  Readonly<{
    id: string;
    row: number;
    column: number;
    widthPixels: number;
    heightPixels: number;
    receiverBounds: LightSpaceBounds;
  }>;

export type ShadowTileDebugPolygon = Readonly<{
  id: string;
  kind: "receiver" | "snapped-receiver" | "tile" | "tile-receiver";
  tileId?: string;
  points: readonly LightSpacePoint[];
}>;

export type ShadowTileLayoutStatistics = Readonly<{
  tileCount: number;
  rowCount: number;
  columnCount: number;
  requestedMetersPerTexel: number;
  effectiveMetersPerTexel: number;
  resolutionScale: number;
  budgetLimited: boolean;
  maxShadowMapDimension: number;
  maxTileCount: number;
  tileBudgetUtilization: number;
  casterGuardTexels: number;
  casterPaddingMeters: number;
  casterGuardMeters: number;
  casterReliefMeters: number;
  casterReachMeters: number;
  receiverWidthMeters: number;
  receiverHeightMeters: number;
  snappedWidthMeters: number;
  snappedHeightMeters: number;
  receiverTexelCount: number;
  allocatedShadowTexelCount: number;
  nearMeters: number;
  farMeters: number;
  depthMeters: number;
  clippedCasterDepthMeters: number;
}>;

export type ShadowTileLayout = Readonly<{
  receiverBounds: LightSpaceBounds;
  snappedReceiverBounds: LightSpaceBounds;
  casterBounds: LightSpaceBounds;
  tiles: readonly ShadowTileBounds[];
  debugPolygons: readonly ShadowTileDebugPolygon[];
  statistics: ShadowTileLayoutStatistics;
}>;

const GRID_TOLERANCE = 1e-10;
const RESOLUTION_TOLERANCE = 1e-9;

const assertFinite = (name: string, value: number) => {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite`);
  }
};

const assertNonNegative = (name: string, value: number) => {
  assertFinite(name, value);
  if (value < 0) {
    throw new RangeError(`${name} must be greater than or equal to zero`);
  }
};

const assertPositive = (name: string, value: number) => {
  assertFinite(name, value);
  if (value <= 0) {
    throw new RangeError(`${name} must be greater than zero`);
  }
};

const assertPositiveInteger = (name: string, value: number) => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
};

const validateBounds = (bounds: LightSpaceBounds) => {
  for (const [name, value] of Object.entries(bounds)) {
    assertFinite(`receiverBounds.${name}`, value);
  }
  if (bounds.left >= bounds.right) {
    throw new RangeError("receiverBounds.left must be less than right");
  }
  if (bounds.bottom >= bounds.top) {
    throw new RangeError("receiverBounds.bottom must be less than top");
  }
  if (bounds.near < 0 || bounds.near >= bounds.far) {
    throw new RangeError(
      "receiverBounds.near must be non-negative and less than far"
    );
  }
};

const gridFloor = (value: number, resolution: number) =>
  Math.floor(value / resolution + GRID_TOLERANCE);

const gridCeil = (value: number, resolution: number) =>
  Math.ceil(value / resolution - GRID_TOLERANCE);

const rectanglePoints = (
  left: number,
  right: number,
  bottom: number,
  top: number
): readonly LightSpacePoint[] => [
  [left, bottom],
  [right, bottom],
  [right, top],
  [left, top],
];

type ResolutionLayout = Readonly<{
  resolution: number;
  leftIndex: number;
  rightIndex: number;
  bottomIndex: number;
  topIndex: number;
  widthTexels: number;
  heightTexels: number;
  columnCount: number;
  rowCount: number;
}>;

const buildResolutionLayout = (
  bounds: LightSpaceBounds,
  resolution: number,
  receiverTileDimension: number
): ResolutionLayout => {
  const leftIndex = gridFloor(bounds.left, resolution);
  const rightIndex = gridCeil(bounds.right, resolution);
  const bottomIndex = gridFloor(bounds.bottom, resolution);
  const topIndex = gridCeil(bounds.top, resolution);
  const widthTexels = rightIndex - leftIndex;
  const heightTexels = topIndex - bottomIndex;
  return {
    resolution,
    leftIndex,
    rightIndex,
    bottomIndex,
    topIndex,
    widthTexels,
    heightTexels,
    columnCount: Math.ceil(widthTexels / receiverTileDimension),
    rowCount: Math.ceil(heightTexels / receiverTileDimension),
  };
};

const chooseResolution = (
  bounds: LightSpaceBounds,
  targetMetersPerTexel: number,
  receiverTileDimension: number,
  maxTileCount: number
): ResolutionLayout => {
  const targetLayout = buildResolutionLayout(
    bounds,
    targetMetersPerTexel,
    receiverTileDimension
  );
  if (targetLayout.columnCount * targetLayout.rowCount <= maxTileCount) {
    return targetLayout;
  }

  const width = bounds.right - bounds.left;
  const height = bounds.top - bounds.bottom;
  let best: ResolutionLayout | null = null;

  // Enumerating the small tile budget gives a deterministic, aspect-aware
  // fallback. The one-texel allowance guarantees that outward snapping still
  // fits in the selected number of maps regardless of the world-grid phase.
  for (let rows = 1; rows <= maxTileCount; rows += 1) {
    const maximumColumns = Math.floor(maxTileCount / rows);
    for (let columns = 1; columns <= maximumColumns; columns += 1) {
      const horizontalCapacity = columns * receiverTileDimension;
      const verticalCapacity = rows * receiverTileDimension;
      if (horizontalCapacity <= 1 || verticalCapacity <= 1) continue;
      const resolution =
        Math.max(
          targetMetersPerTexel,
          width / (horizontalCapacity - 1),
          height / (verticalCapacity - 1)
        ) *
        (1 + Number.EPSILON * 8);
      const candidate = buildResolutionLayout(
        bounds,
        resolution,
        receiverTileDimension
      );
      const candidateTileCount = candidate.columnCount * candidate.rowCount;
      if (
        candidateTileCount > maxTileCount ||
        candidate.columnCount > columns ||
        candidate.rowCount > rows
      ) {
        continue;
      }
      const bestTileCount = best
        ? best.columnCount * best.rowCount
        : Number.POSITIVE_INFINITY;
      if (
        !best ||
        candidate.resolution < best.resolution - RESOLUTION_TOLERANCE ||
        (Math.abs(candidate.resolution - best.resolution) <=
          RESOLUTION_TOLERANCE &&
          candidateTileCount < bestTileCount)
      ) {
        best = candidate;
      }
    }
  }

  if (!best) {
    throw new Error("Unable to fit the receiver bounds into the tile budget");
  }
  return best;
};

/**
 * Partitions a light-space receiver rectangle into overlapping orthographic
 * shadow-map tiles. Receiver edges are snapped outwards to a stable texel grid;
 * the caster padding becomes a guard band in every map. Relief and low-sun
 * reach extend the depth prism towards the light instead of widening its
 * projected footprint, because directional-light rays are parallel in light
 * space.
 */
export const buildShadowTileLayout = (
  options: ShadowTileLayoutOptions
): ShadowTileLayout => {
  const {
    receiverBounds,
    casterPaddingMeters,
    casterReliefMeters,
    casterReachMeters,
    targetMetersPerTexel,
    maxShadowMapDimension,
    maxTileCount,
  } = options;
  validateBounds(receiverBounds);
  assertNonNegative("casterPaddingMeters", casterPaddingMeters);
  assertNonNegative("casterReliefMeters", casterReliefMeters);
  assertNonNegative("casterReachMeters", casterReachMeters);
  assertPositive("targetMetersPerTexel", targetMetersPerTexel);
  assertPositiveInteger("maxShadowMapDimension", maxShadowMapDimension);
  assertPositiveInteger("maxTileCount", maxTileCount);

  // Keep the guard in requested-resolution texels. If the tile budget forces a
  // coarser layout, the physical guard grows rather than becoming unsafe.
  const casterGuardTexels = Math.ceil(
    casterPaddingMeters / targetMetersPerTexel - GRID_TOLERANCE
  );
  const receiverTileDimension = maxShadowMapDimension - casterGuardTexels * 2;
  if (receiverTileDimension < 2) {
    throw new RangeError(
      "casterPaddingMeters leaves fewer than two receiver texels per tile"
    );
  }

  const grid = chooseResolution(
    receiverBounds,
    targetMetersPerTexel,
    receiverTileDimension,
    maxTileCount
  );
  const resolution = grid.resolution;
  const guardMeters = casterGuardTexels * resolution;
  const clippedNear =
    receiverBounds.near - casterReliefMeters - casterReachMeters;
  const near = Math.max(0, clippedNear);
  const far = receiverBounds.far + casterReliefMeters;
  const snappedLeft = grid.leftIndex * resolution;
  const snappedRight = grid.rightIndex * resolution;
  const snappedBottom = grid.bottomIndex * resolution;
  const snappedTop = grid.topIndex * resolution;
  const snappedReceiverBounds: LightSpaceBounds = {
    left: snappedLeft,
    right: snappedRight,
    bottom: snappedBottom,
    top: snappedTop,
    near: receiverBounds.near,
    far: receiverBounds.far,
  };
  const tiles: ShadowTileBounds[] = [];
  for (let row = 0; row < grid.rowCount; row += 1) {
    const receiverTopIndex = grid.topIndex - row * receiverTileDimension;
    const receiverBottomIndex = Math.max(
      grid.bottomIndex,
      receiverTopIndex - receiverTileDimension
    );
    for (let column = 0; column < grid.columnCount; column += 1) {
      const receiverLeftIndex = grid.leftIndex + column * receiverTileDimension;
      const receiverRightIndex = Math.min(
        grid.rightIndex,
        receiverLeftIndex + receiverTileDimension
      );
      const tileReceiverBounds: LightSpaceBounds = {
        left: receiverLeftIndex * resolution,
        right: receiverRightIndex * resolution,
        bottom: receiverBottomIndex * resolution,
        top: receiverTopIndex * resolution,
        near: receiverBounds.near,
        far: receiverBounds.far,
      };
      const fullReceiverRightIndex = receiverLeftIndex + receiverTileDimension;
      const fullReceiverBottomIndex = receiverTopIndex - receiverTileDimension;
      tiles.push({
        id: `r${row}-c${column}`,
        row,
        column,
        left: tileReceiverBounds.left - guardMeters,
        right: fullReceiverRightIndex * resolution + guardMeters,
        bottom: fullReceiverBottomIndex * resolution - guardMeters,
        top: tileReceiverBounds.top + guardMeters,
        near,
        far,
        widthPixels: maxShadowMapDimension,
        heightPixels: maxShadowMapDimension,
        receiverBounds: tileReceiverBounds,
      });
    }
  }
  const casterBounds: LightSpaceBounds = {
    left: Math.min(...tiles.map(({ left }) => left)),
    right: Math.max(...tiles.map(({ right }) => right)),
    bottom: Math.min(...tiles.map(({ bottom }) => bottom)),
    top: Math.max(...tiles.map(({ top }) => top)),
    near,
    far,
  };

  const debugPolygons: ShadowTileDebugPolygon[] = [
    {
      id: "receiver",
      kind: "receiver",
      points: rectanglePoints(
        receiverBounds.left,
        receiverBounds.right,
        receiverBounds.bottom,
        receiverBounds.top
      ),
    },
    {
      id: "receiver-snapped",
      kind: "snapped-receiver",
      points: rectanglePoints(
        snappedLeft,
        snappedRight,
        snappedBottom,
        snappedTop
      ),
    },
  ];
  for (const tile of tiles) {
    debugPolygons.push(
      {
        id: `${tile.id}-receiver`,
        kind: "tile-receiver",
        tileId: tile.id,
        points: rectanglePoints(
          tile.receiverBounds.left,
          tile.receiverBounds.right,
          tile.receiverBounds.bottom,
          tile.receiverBounds.top
        ),
      },
      {
        id: tile.id,
        kind: "tile",
        tileId: tile.id,
        points: rectanglePoints(tile.left, tile.right, tile.bottom, tile.top),
      }
    );
  }

  const allocatedShadowTexelCount =
    tiles.length * maxShadowMapDimension * maxShadowMapDimension;
  return {
    receiverBounds,
    snappedReceiverBounds,
    casterBounds,
    tiles,
    debugPolygons,
    statistics: {
      tileCount: tiles.length,
      rowCount: grid.rowCount,
      columnCount: grid.columnCount,
      requestedMetersPerTexel: targetMetersPerTexel,
      effectiveMetersPerTexel: resolution,
      resolutionScale: resolution / targetMetersPerTexel,
      budgetLimited:
        resolution > targetMetersPerTexel * (1 + RESOLUTION_TOLERANCE),
      maxShadowMapDimension,
      maxTileCount,
      tileBudgetUtilization: tiles.length / maxTileCount,
      casterGuardTexels,
      casterPaddingMeters,
      casterGuardMeters: guardMeters,
      casterReliefMeters,
      casterReachMeters,
      receiverWidthMeters: receiverBounds.right - receiverBounds.left,
      receiverHeightMeters: receiverBounds.top - receiverBounds.bottom,
      snappedWidthMeters: snappedRight - snappedLeft,
      snappedHeightMeters: snappedTop - snappedBottom,
      receiverTexelCount: grid.widthTexels * grid.heightTexels,
      allocatedShadowTexelCount,
      nearMeters: near,
      farMeters: far,
      depthMeters: far - near,
      clippedCasterDepthMeters: Math.max(0, -clippedNear),
    },
  };
};
