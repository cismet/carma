import { clamp } from "@carma-commons/math";

import { TILES_LOAD_POLICY } from "./tile-load-config";

const MIB = 1024 ** 2;
const GIB = 1024 ** 3;

export const TILE_MEMORY_ALLOCATION_ERROR =
  /out of memory|allocation failed|failed to allocate|cannot allocate memory/i;

/**
 * Decision: TILES_COVERAGE.md#resident-cache-ceiling-policy-2026-09-18.
 * Desktops start optimistically at 6 GiB (scaled down only when the browser
 * reports little memory); phones and tablets have hard caps that no consumer
 * budget can raise. Healthy, occupied desktop grants grow in bounded steps;
 * confirmed memory failures lower the limit for the current bundle.
 */
export const TILES_CACHE_CEILING_BYTES = {
  configuredMaximum: 24 * GIB,
  ios: 384 * MIB,
  mobile: 512 * MIB,
  desktopDefault: 6 * GIB,
  desktopMinimum: 768 * MIB,
  desktopMaximum: 6 * GIB,
  perDeviceMemoryGiB: 768 * MIB,
  floor: 128 * MIB,
} as const;

export type TilesDeviceProfile = Readonly<{
  deviceMemoryGiB?: number;
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
}>;

export type TilesCacheStyleLimits = Readonly<{
  cacheBudgetBytes?: number;
  cacheOverflowBytes?: number;
}>;

const isIosDevice = (device: TilesDeviceProfile): boolean =>
  /iPhone|iPad|iPod/i.test(device.userAgent) ||
  (device.platform === "MacIntel" && device.maxTouchPoints > 1);

const isMobileDevice = (device: TilesDeviceProfile): boolean =>
  /Android|Mobile/i.test(device.userAgent);

const validDeviceMemory = (device: TilesDeviceProfile) =>
  device.deviceMemoryGiB !== undefined &&
  Number.isFinite(device.deviceMemoryGiB) &&
  device.deviceMemoryGiB > 0;

/** Browser memory hints are not an allocation grant. Larger desktops grow from
 * the normal seed; reported low-memory devices and explicit limits stay capped.
 */
export const resolveTilesCacheMaximum = (
  device: TilesDeviceProfile,
  style?: TilesCacheStyleLimits,
  learnedCeilingBytes?: number | null
): number => {
  let maximum: number = isIosDevice(device)
    ? TILES_CACHE_CEILING_BYTES.ios
    : isMobileDevice(device)
    ? TILES_CACHE_CEILING_BYTES.mobile
    : validDeviceMemory(device) && device.deviceMemoryGiB! < 8
    ? Math.max(
        TILES_CACHE_CEILING_BYTES.desktopMinimum,
        device.deviceMemoryGiB! * TILES_CACHE_CEILING_BYTES.perDeviceMemoryGiB
      )
    : TILES_CACHE_CEILING_BYTES.configuredMaximum;
  if (
    Number.isFinite(style?.cacheBudgetBytes) &&
    Number.isFinite(style?.cacheOverflowBytes ?? 0)
  )
    maximum = Math.min(
      maximum,
      Math.max(0, style!.cacheBudgetBytes!) +
        Math.max(0, style?.cacheOverflowBytes ?? 0)
    );
  if (learnedCeilingBytes != null && Number.isFinite(learnedCeilingBytes))
    maximum = Math.min(maximum, learnedCeilingBytes);
  return Math.max(TILES_CACHE_CEILING_BYTES.floor, Math.floor(maximum));
};

export const TILE_CACHE_GROWTH = {
  residentFraction: 0.9,
  step: 1.2,
  cooldownMs: 10_000,
} as const;

/** Queued estimates never qualify as evidence that a larger grant is useful. */
export const nextTilesCacheCeiling = (
  input: Readonly<{
    current: number;
    maximum: number;
    loadedResidentBytes: number;
    workOutstanding: boolean;
    healthy: boolean;
    now: number;
    lastGrowthAt: number;
  }>
): number =>
  input.healthy &&
  input.workOutstanding &&
  Number.isFinite(input.loadedResidentBytes) &&
  input.loadedResidentBytes >=
    input.current * TILE_CACHE_GROWTH.residentFraction &&
  input.now - input.lastGrowthAt >= TILE_CACHE_GROWTH.cooldownMs
    ? Math.max(
        input.current,
        Math.min(
          input.maximum,
          Math.floor(input.current * TILE_CACHE_GROWTH.step)
        )
      )
    : input.current;

export const resolveTilesCacheCeiling = (
  device: TilesDeviceProfile,
  style?: TilesCacheStyleLimits,
  /** A ceiling learned from an earlier failure; only ever lowers the result. */
  learnedCeilingBytes?: number | null
): number => {
  let ceiling: number;
  const hardCap = resolveTilesCacheMaximum(device);
  if (isIosDevice(device) || isMobileDevice(device)) {
    ceiling = hardCap;
  } else if (validDeviceMemory(device)) {
    ceiling = clamp(
      device.deviceMemoryGiB! * TILES_CACHE_CEILING_BYTES.perDeviceMemoryGiB,
      TILES_CACHE_CEILING_BYTES.desktopMinimum,
      TILES_CACHE_CEILING_BYTES.desktopMaximum
    );
  } else {
    ceiling = TILES_CACHE_CEILING_BYTES.desktopDefault;
  }

  const budget = style?.cacheBudgetBytes;
  if (budget !== undefined && Number.isFinite(budget)) {
    const overflow = style?.cacheOverflowBytes ?? 0;
    const styleCeiling = Number.isFinite(overflow)
      ? Math.max(0, budget) + Math.max(0, overflow)
      : Number.POSITIVE_INFINITY;
    if (Number.isFinite(styleCeiling))
      ceiling = Math.min(styleCeiling, hardCap);
  }
  if (
    learnedCeilingBytes !== undefined &&
    learnedCeilingBytes !== null &&
    Number.isFinite(learnedCeilingBytes)
  )
    ceiling = Math.min(ceiling, learnedCeilingBytes);
  return Math.max(TILES_CACHE_CEILING_BYTES.floor, Math.floor(ceiling));
};

export type TilesCacheBounds = Readonly<{
  minBytesSize: number;
  maxBytesSize: number;
}>;

/** Eviction bounds of the LRU around a physical admission ceiling. */
export const resolveTilesCacheBounds = (input: {
  ceilingBytes: number;
  estimateBytes: number;
}): TilesCacheBounds => ({
  minBytesSize: Math.floor(
    input.ceilingBytes * TILES_LOAD_POLICY.cacheRetentionFraction
  ),
  maxBytesSize:
    input.ceilingBytes +
    Math.max(
      TILES_LOAD_POLICY.cacheDriftSlackMinBytes,
      TILES_LOAD_POLICY.cacheDriftSlackEstimates * input.estimateBytes
    ),
});
