import { Cartesian2 } from "@carma-cesium";

export type CesiumPointQueryConfig = {
  clickDelayMs?: number;
  doubleClickDistancePx?: number;
  cameraMovePickIntervalMs?: number;
  surfaceMissLimit?: number;
  normalSampleIntervalMs?: number;
  normalSampleDistancePx?: number;
  debugLog?: boolean;
};

export const DEFAULT_POINT_QUERY_CONFIG = {
  clickDelayMs: 220,
  doubleClickDistancePx: 12,
  cameraMovePickIntervalMs: 75,
  surfaceMissLimit: 2,
  normalSampleIntervalMs: 48,
  normalSampleDistancePx: 6,
  debugLog: false,
} as const;

const EMPTY_POINT_QUERY_CONFIG: CesiumPointQueryConfig = {};

const toNonNegativeNumber = (value: number | undefined, fallback: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : fallback;

const toNonNegativeInteger = (value: number | undefined, fallback: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback;

export const resolvePointQueryConfig = (
  config: CesiumPointQueryConfig | undefined
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

export const isScreenPositionWithinDistance = (
  previousPosition: Cartesian2 | null,
  nextPosition: Cartesian2,
  maxDistancePx: number
) =>
  Boolean(
    previousPosition &&
      Cartesian2.distance(previousPosition, nextPosition) <= maxDistancePx
  );
