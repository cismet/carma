const FILTER_GUARD_TEXELS = 3;
const SNAP_GUARD_TEXELS = 0.5;
const MAP_DIMENSION_STEP = 64;
const MIN_GROUND_ELEVATION_SINE = 0.01;

type ReceiverBounds = Readonly<{
  left: number;
  right: number;
  bottom: number;
  top: number;
}>;

export const resolveShadowMapTexelBudget = (
  requestedBudget: number | undefined,
  defaultBudget: number,
  maxMapSize: number
): number =>
  Math.min(
    maxMapSize ** 2,
    Math.max(
      MAP_DIMENSION_STEP ** 2,
      Math.floor(
        requestedBudget !== undefined &&
          Number.isFinite(requestedBudget) &&
          requestedBudget > 0
          ? requestedBudget
          : defaultBudget
      )
    )
  );

export const fitShadowMap = (
  receiverBounds: ReceiverBounds,
  options: Readonly<{
    mapSize: number;
    mapTexelBudget?: number;
    maxMapSize: number;
    elevationSine: number;
    sunDiscGuardMeters: number;
    groundTexelFit: boolean;
    /** Keep an already allocated target while fitting a moving receiver. */
    mapDimensions?: Readonly<{ width: number; height: number }>;
  }>
) => {
  const {
    mapSize,
    maxMapSize,
    elevationSine,
    sunDiscGuardMeters,
    groundTexelFit,
  } = options;
  const width =
    receiverBounds.right - receiverBounds.left + 2 * sunDiscGuardMeters;
  const height =
    receiverBounds.top - receiverBounds.bottom + 2 * sunDiscGuardMeters;
  const projectionSine = Math.max(
    MIN_GROUND_ELEVATION_SINE,
    Math.abs(elevationSine)
  );
  const guardTexels = groundTexelFit
    ? FILTER_GUARD_TEXELS + SNAP_GUARD_TEXELS
    : FILTER_GUARD_TEXELS;
  const guardDiameter = 2 * guardTexels;
  let mapWidth = mapSize;
  let mapHeight = mapSize;
  let hardwareLimited = false;
  let preservedResolutionLimited = false;

  if (groundTexelFit) {
    // With world Y as camera up, a light-space Y texel projects to the
    // horizontal ground with length dy / sin(elevation). Include the guards
    // in the allocation so the usable pixels, rather than just the texture
    // dimensions, have the required ratio.
    const ratio = (width * projectionSine) / height;
    const budget = options.mapTexelBudget ?? mapSize * mapSize;
    const linearCoefficient = guardDiameter * (ratio + 1);
    const usableArea = budget - guardDiameter * guardDiameter;
    const usableHeight =
      (2 * usableArea) /
      (linearCoefficient +
        Math.sqrt(linearCoefficient ** 2 + 4 * ratio * usableArea));
    const idealWidth = ratio * usableHeight + guardDiameter;
    const idealHeight = usableHeight + guardDiameter;
    hardwareLimited = idealWidth > maxMapSize || idealHeight > maxMapSize;
    const baselineTexel = Math.max(width, height) / (mapSize - guardDiameter);
    const minimumWidth = Math.min(
      mapSize,
      Math.max(
        MAP_DIMENSION_STEP,
        Math.ceil(
          (width / baselineTexel + guardDiameter) / MAP_DIMENSION_STEP
        ) * MAP_DIMENSION_STEP
      )
    );
    const minimumHeight = Math.min(
      mapSize,
      Math.max(
        MAP_DIMENSION_STEP,
        Math.ceil(
          (height / baselineTexel + guardDiameter) / MAP_DIMENSION_STEP
        ) * MAP_DIMENSION_STEP
      )
    );
    preservedResolutionLimited =
      idealWidth < minimumWidth || idealHeight < minimumHeight;
    const targetWidth = Math.min(
      Math.max(idealWidth, minimumWidth, budget / maxMapSize),
      maxMapSize,
      budget / minimumHeight
    );
    const quantizeDimension = (dimension: number) =>
      Math.floor(dimension / MAP_DIMENSION_STEP + 1e-9) * MAP_DIMENSION_STEP;
    // Quantized dimensions avoid reallocating the depth target for every
    // sub-pixel change of the receiver aspect ratio during a map move.
    mapWidth = Math.max(minimumWidth, quantizeDimension(targetWidth));
    // Preserve the original square fit's detail on both axes. When isotropy
    // would require a coarser axis, spend the remaining budget instead and
    // report the residual anisotropy rather than discarding useful samples.
    mapHeight = Math.max(
      minimumHeight,
      quantizeDimension(Math.min(maxMapSize, budget / mapWidth))
    );
  }

  const retainedDimensions = options.mapDimensions;
  if (retainedDimensions) {
    // The frustum/guards still fit the current receiver. Only allocation is
    // stable; no screen-space texture or stale camera projection is reused.
    preservedResolutionLimited ||=
      mapWidth !== retainedDimensions.width ||
      mapHeight !== retainedDimensions.height;
    mapWidth = retainedDimensions.width;
    mapHeight = retainedDimensions.height;
  }

  const horizontalTexel = width / Math.max(1, mapWidth - guardDiameter);
  const verticalTexel = height / Math.max(1, mapHeight - guardDiameter);
  const squareTexel = Math.max(horizontalTexel, verticalTexel, Number.EPSILON);
  const metersPerTexelX = groundTexelFit ? horizontalTexel : squareTexel;
  const metersPerTexelY = groundTexelFit ? verticalTexel : squareTexel;
  const centerX =
    Math.round(
      (receiverBounds.left + receiverBounds.right) / 2 / metersPerTexelX
    ) * metersPerTexelX;
  const centerY =
    Math.round(
      (receiverBounds.bottom + receiverBounds.top) / 2 / metersPerTexelY
    ) * metersPerTexelY;
  const fittedWidth = metersPerTexelX * mapWidth;
  const fittedHeight = metersPerTexelY * mapHeight;

  return {
    left: centerX - fittedWidth / 2,
    right: centerX + fittedWidth / 2,
    bottom: centerY - fittedHeight / 2,
    top: centerY + fittedHeight / 2,
    mapWidth,
    mapHeight,
    metersPerTexelX,
    metersPerTexelY,
    guardMetersX: metersPerTexelX * FILTER_GUARD_TEXELS,
    guardMetersY: metersPerTexelY * FILTER_GUARD_TEXELS,
    groundTexelWidthMeters: metersPerTexelX,
    groundTexelHeightMeters:
      Math.abs(elevationSine) > Number.EPSILON
        ? metersPerTexelY / Math.abs(elevationSine)
        : Infinity,
    groundTexelFitLimited:
      groundTexelFit &&
      (hardwareLimited ||
        preservedResolutionLimited ||
        Math.abs(elevationSine) < MIN_GROUND_ELEVATION_SINE),
  };
};

export const getSunDiscReceiverGuard = (
  receiverRadiusMeters: number,
  elevationSine: number,
  angularRadius: number
) => {
  if (angularRadius <= 0) return { planarMeters: 0, depthMeters: 0 };
  const horizontalDirectionLength = Math.sqrt(
    Math.max(0, 1 - elevationSine ** 2)
  );
  const maximumAzimuthOffset =
    horizontalDirectionLength > Math.sin(angularRadius)
      ? Math.asin(Math.sin(angularRadius) / horizontalDirectionLength)
      : Math.PI;
  // The world-up camera frame can yaw by more than the sun's angular radius.
  // Bound the receiver sphere under yaw + pitch; at the zenith azimuth is
  // undefined, so conservatively enclose its complete possible rotation.
  return {
    planarMeters:
      2 *
      receiverRadiusMeters *
      Math.sin(Math.min(Math.PI, maximumAzimuthOffset + angularRadius) / 2),
    depthMeters: 2 * receiverRadiusMeters * Math.sin(angularRadius / 2),
  };
};
