import type {
  AnnotationPointQueryConfig,
  AnnotationScreenPosition,
} from "./annotation-engine.types";

export const DEFAULT_POINT_QUERY_CONFIG = {
  clickDelayMs: 220,
  doubleClickDistancePx: 12,
  cameraMovePickIntervalMs: 75,
  surfaceMissLimit: 2,
  normalSampleIntervalMs: 48,
  normalSampleDistancePx: 6,
  debugLog: false,
} as const;

const EMPTY_POINT_QUERY_CONFIG: AnnotationPointQueryConfig = {};

const toNonNegativeNumber = (value: number | undefined, fallback: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : fallback;

const toNonNegativeInteger = (value: number | undefined, fallback: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback;

export const resolvePointQueryConfig = (
  config: AnnotationPointQueryConfig | undefined
) => {
  const pointQueryConfig = config ?? EMPTY_POINT_QUERY_CONFIG;

  return {
    clickDelayMs: toNonNegativeNumber(
      pointQueryConfig.clickDelayMs,
      DEFAULT_POINT_QUERY_CONFIG.clickDelayMs
    ),
    doubleClickDistancePx: toNonNegativeNumber(
      pointQueryConfig.doubleClickDistancePx,
      DEFAULT_POINT_QUERY_CONFIG.doubleClickDistancePx
    ),
    cameraMovePickIntervalMs: toNonNegativeNumber(
      pointQueryConfig.cameraMovePickIntervalMs,
      DEFAULT_POINT_QUERY_CONFIG.cameraMovePickIntervalMs
    ),
    surfaceMissLimit: toNonNegativeInteger(
      pointQueryConfig.surfaceMissLimit,
      DEFAULT_POINT_QUERY_CONFIG.surfaceMissLimit
    ),
    normalSampleIntervalMs: toNonNegativeNumber(
      pointQueryConfig.normalSampleIntervalMs,
      DEFAULT_POINT_QUERY_CONFIG.normalSampleIntervalMs
    ),
    normalSampleDistancePx: toNonNegativeNumber(
      pointQueryConfig.normalSampleDistancePx,
      DEFAULT_POINT_QUERY_CONFIG.normalSampleDistancePx
    ),
    debugLog: pointQueryConfig.debugLog ?? DEFAULT_POINT_QUERY_CONFIG.debugLog,
  };
};

/** Port of `Cartesian2.distance` for plain screen positions. */
export const getScreenPositionDistance = (
  left: AnnotationScreenPosition,
  right: AnnotationScreenPosition
) => {
  const deltaX = left.x - right.x;
  const deltaY = left.y - right.y;

  return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
};

export const isScreenPositionWithinDistance = (
  previousPosition: AnnotationScreenPosition | null,
  nextPosition: AnnotationScreenPosition,
  maxDistancePx: number
) =>
  Boolean(
    previousPosition &&
      getScreenPositionDistance(previousPosition, nextPosition) <= maxDistancePx
  );
