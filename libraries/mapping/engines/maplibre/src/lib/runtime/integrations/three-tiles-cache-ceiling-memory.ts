import { TILES_CACHE_CEILING_BYTES } from "../../core/tile-cache-policy";

/** Learned device limit for this application bundle. Runtime probes stay local. */
export const CACHE_CEILING_STORAGE_KEY = "carma:tiles3d-cache-ceiling";
export const CACHE_CEILING_FAILURE_FRACTION = 0.8;
const CACHE_CEILING_FORMAT = "0.1";
/** Production filenames carry the emitted bundle hash. Dev HMR timestamps do
 * not define another application build, so query/hash parts are excluded. */
export const cacheCeilingBuildId = (moduleUrl: string): string => {
  const url = new URL(moduleUrl);
  return `${url.origin}${url.pathname}`;
};
export const CACHE_CEILING_BUILD_ID = cacheCeilingBuildId(import.meta.url);
export const cacheCeilingStorageKey = (buildId = CACHE_CEILING_BUILD_ID) =>
  `${CACHE_CEILING_STORAGE_KEY}:${encodeURIComponent(buildId)}`;

export const CACHE_CEILING_REASON = {
  ALLOCATION: "allocation",
  CONTEXT_LOST: "context-lost",
} as const;

export type CacheCeilingReason =
  (typeof CACHE_CEILING_REASON)[keyof typeof CACHE_CEILING_REASON];

export type CacheCeilingProbe = Readonly<{
  ceilingBytes: number;
  peakBytes: number;
  healthy: boolean;
  startedAt: number;
}>;

export type CacheCeilingMemory = Readonly<{
  version: typeof CACHE_CEILING_FORMAT;
  buildId: string;
  learnedBytes: number | null;
  reason: CacheCeilingReason | null;
  probe: CacheCeilingProbe | null;
}>;

export const EMPTY_CACHE_CEILING_MEMORY: CacheCeilingMemory = {
  version: CACHE_CEILING_FORMAT,
  buildId: CACHE_CEILING_BUILD_ID,
  learnedBytes: null,
  reason: null,
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
  storage: Storage | null,
  buildId = CACHE_CEILING_BUILD_ID
): CacheCeilingMemory => {
  const empty =
    buildId === CACHE_CEILING_BUILD_ID
      ? EMPTY_CACHE_CEILING_MEMORY
      : { ...EMPTY_CACHE_CEILING_MEMORY, buildId };
  if (!storage) return empty;
  try {
    const raw = storage.getItem(cacheCeilingStorageKey(buildId));
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<CacheCeilingMemory>;
    if (parsed.version !== CACHE_CEILING_FORMAT || parsed.buildId !== buildId)
      return empty;
    const learned =
      typeof parsed.learnedBytes === "number" &&
      Number.isFinite(parsed.learnedBytes)
        ? floorBytes(parsed.learnedBytes)
        : null;
    return {
      version: CACHE_CEILING_FORMAT,
      buildId,
      learnedBytes: learned,
      reason: learned === null ? null : parsed.reason ?? null,
      probe: null,
    };
  } catch {
    return empty;
  }
};

export const writeCacheCeilingMemory = (
  storage: Storage | null,
  memory: CacheCeilingMemory
): void => {
  if (!storage) return;
  try {
    storage.setItem(
      cacheCeilingStorageKey(memory.buildId),
      JSON.stringify({ ...memory, probe: null })
    );
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
  return { ...memory, learnedBytes: candidate, reason };
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

/** A clean end never raises a confirmed failure limit within this bundle. */
export const endCacheCeilingSession = (
  memory: CacheCeilingMemory
): CacheCeilingMemory =>
  !memory.probe || memory.probe.healthy
    ? memory
    : { ...memory, probe: { ...memory.probe, healthy: true } };
