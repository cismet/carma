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
 * budget can raise; a learned ceiling from an allocation failure, a lost
 * context or a session that never ended cleanly lowers all of them.
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

export const resolveTilesCacheCeiling = (
  device: TilesDeviceProfile,
  style?: TilesCacheStyleLimits,
  /** A ceiling learned from an earlier failure; only ever lowers the result. */
  learnedCeilingBytes?: number | null
): number => {
  let ceiling: number;
  // A consumer budget may raise a desktop up to the configured maximum, a
  // phone or tablet never: its class ceiling is the hard cap.
  let hardCap: number = TILES_CACHE_CEILING_BYTES.configuredMaximum;
  if (isIosDevice(device)) {
    ceiling = TILES_CACHE_CEILING_BYTES.ios;
    hardCap = ceiling;
  } else if (isMobileDevice(device)) {
    ceiling = TILES_CACHE_CEILING_BYTES.mobile;
    hardCap = ceiling;
  } else if (
    device.deviceMemoryGiB !== undefined &&
    Number.isFinite(device.deviceMemoryGiB) &&
    device.deviceMemoryGiB > 0
  ) {
    ceiling = clamp(
      device.deviceMemoryGiB * TILES_CACHE_CEILING_BYTES.perDeviceMemoryGiB,
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
