import { TILES_CACHE_CEILING_BYTES } from "../../core/tile-cache-policy";

/**
 * The resident cache ceiling a client really supports, learned from failures
 * and kept in localStorage across sessions. Decision:
 * TILES_COVERAGE.md#resident-cache-ceiling-policy-2026-09-18.
 *
 * - An allocation failure learns 75 % of the bytes resident at that moment
 *   (at least 75 % of the ceiling); a lost WebGL context does the same, but
 *   only when the cache was at least half full, a GPU reset is no lesson.
 * - A session that never ended cleanly (no page hide, no dispose: the tab was
 *   killed) learns 50 % of its peak resident bytes on the next start.
 * - Three clean sessions that used at least 90 % of a learned ceiling raise
 *   it again by half, up to the unlearned ceiling, so a wrong lesson fades.
 */
export const CACHE_CEILING_STORAGE_KEY = "carma:tiles3d-cache-ceiling";
export const CACHE_CEILING_FAILURE_FRACTION = 0.75;
export const CACHE_CEILING_CRASH_FRACTION = 0.5;
export const CACHE_CEILING_RECOVERY_RUNS = 3;
export const CACHE_CEILING_RECOVERY_GROWTH = 1.5;
export const CACHE_CEILING_PEAK_WRITE_INTERVAL_MS = 5_000;

export type CacheCeilingReason =
  | "allocation"
  | "context-lost"
  | "unhealthy-session";

export type CacheCeilingProbe = Readonly<{
  ceilingBytes: number;
  peakBytes: number;
  healthy: boolean;
  startedAt: number;
}>;

export type CacheCeilingMemory = Readonly<{
  version: 1;
  learnedBytes: number | null;
  reason: CacheCeilingReason | null;
  healthyRuns: number;
  probe: CacheCeilingProbe | null;
}>;

export const EMPTY_CACHE_CEILING_MEMORY: CacheCeilingMemory = {
  version: 1,
  learnedBytes: null,
  reason: null,
  healthyRuns: 0,
  probe: null,
};

const floorBytes = (bytes: number) =>
  Math.max(TILES_CACHE_CEILING_BYTES.floor, Math.floor(bytes));

export const getCacheCeilingStorage = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

export const readCacheCeilingMemory = (
  storage: Storage | null
): CacheCeilingMemory => {
  if (!storage) return EMPTY_CACHE_CEILING_MEMORY;
  try {
    const raw = storage.getItem(CACHE_CEILING_STORAGE_KEY);
    if (!raw) return EMPTY_CACHE_CEILING_MEMORY;
    const parsed = JSON.parse(raw) as Partial<CacheCeilingMemory>;
    if (parsed.version !== 1) return EMPTY_CACHE_CEILING_MEMORY;
    const learned =
      typeof parsed.learnedBytes === "number" &&
      Number.isFinite(parsed.learnedBytes)
        ? floorBytes(parsed.learnedBytes)
        : null;
    const probe =
      parsed.probe &&
      typeof parsed.probe.peakBytes === "number" &&
      typeof parsed.probe.ceilingBytes === "number"
        ? {
            ceilingBytes: parsed.probe.ceilingBytes,
            peakBytes: Math.max(0, parsed.probe.peakBytes),
            healthy: parsed.probe.healthy === true,
            startedAt: Number(parsed.probe.startedAt) || 0,
          }
        : null;
    return {
      version: 1,
      learnedBytes: learned,
      reason: learned === null ? null : parsed.reason ?? null,
      healthyRuns: Math.max(0, Math.floor(Number(parsed.healthyRuns) || 0)),
      probe,
    };
  } catch {
    return EMPTY_CACHE_CEILING_MEMORY;
  }
};

export const writeCacheCeilingMemory = (
  storage: Storage | null,
  memory: CacheCeilingMemory
): void => {
  if (!storage) return;
  try {
    storage.setItem(CACHE_CEILING_STORAGE_KEY, JSON.stringify(memory));
  } catch {
    /* Quota or private mode: the lesson is lost, nothing else. */
  }
};

/** Lower the learned ceiling to `bytes`; a lesson never raises it. */
export const learnCacheCeiling = (
  memory: CacheCeilingMemory,
  bytes: number,
  reason: CacheCeilingReason
): CacheCeilingMemory => {
  const candidate = floorBytes(bytes);
  if (memory.learnedBytes !== null && memory.learnedBytes <= candidate)
    return memory;
  return { ...memory, learnedBytes: candidate, reason, healthyRuns: 0 };
};

/** A previous session that never ended cleanly counts as a crash. */
export const settleCrashedCacheCeilingSession = (
  memory: CacheCeilingMemory
): CacheCeilingMemory => {
  const probe = memory.probe;
  if (!probe || probe.healthy || probe.peakBytes <= 0) return memory;
  return learnCacheCeiling(
    memory,
    probe.peakBytes * CACHE_CEILING_CRASH_FRACTION,
    "unhealthy-session"
  );
};

export const startCacheCeilingSession = (
  memory: CacheCeilingMemory,
  ceilingBytes: number,
  now: number
): CacheCeilingMemory => ({
  ...memory,
  probe: { ceilingBytes, peakBytes: 0, healthy: false, startedAt: now },
});

export const recordCacheCeilingPeak = (
  memory: CacheCeilingMemory,
  bytes: number
): CacheCeilingMemory => {
  if (!memory.probe || !(bytes > memory.probe.peakBytes)) return memory;
  return { ...memory, probe: { ...memory.probe, peakBytes: bytes } };
};

/** Mark the session clean and let a well-used learned ceiling recover. */
export const endCacheCeilingSession = (
  memory: CacheCeilingMemory,
  recoverUpToBytes: number
): CacheCeilingMemory => {
  const probe = memory.probe;
  if (!probe || probe.healthy) return memory;
  let next: CacheCeilingMemory = {
    ...memory,
    probe: { ...probe, healthy: true },
  };
  if (
    next.learnedBytes !== null &&
    probe.peakBytes >= next.learnedBytes * 0.9 &&
    Number.isFinite(recoverUpToBytes)
  ) {
    const healthyRuns = next.healthyRuns + 1;
    if (healthyRuns >= CACHE_CEILING_RECOVERY_RUNS) {
      const raised = Math.min(
        next.learnedBytes * CACHE_CEILING_RECOVERY_GROWTH,
        recoverUpToBytes
      );
      next =
        raised >= recoverUpToBytes
          ? { ...next, learnedBytes: null, reason: null, healthyRuns: 0 }
          : { ...next, learnedBytes: Math.floor(raised), healthyRuns: 0 };
    } else {
      next = { ...next, healthyRuns };
    }
  }
  return next;
};
