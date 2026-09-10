import {
  calibrateDerivedCacheStrategies,
  decodeTypedBinaryRecord,
  encodeTypedBinaryRecord,
  isDerivedCacheSavingSufficient,
  type DerivedBufferCache,
  type DerivedCacheMetadata,
} from "@carma-commons/utils";
import type { CachedProjectedTerrainTile } from "./projected-terrain-cache-record";

type Format = "native" | "binary" | "meshopt";
type StoredRecord = {
  kind: "terrain-component-v1";
  format: Exclude<Format, "native">;
  payload: Blob;
};
type Profile = {
  environment: string;
  measuredAt: number;
  format: Format;
  scope: "worker-storage-restore";
  observedReuseCount: number;
  audit: ReturnType<typeof calibrateDerivedCacheStrategies>;
};
const PROFILE_VERSION = "terrain-cache-formats-v1:meshopt-0.25-exact";
const PROFILE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_MAX_BYTES = 32 * 1024 ** 2;
const SEED_TTL_MS = 60_000;
type CalibrationSeed = {
  owner: symbol;
  entry: CachedProjectedTerrainTile;
  row: DerivedCacheMetadata;
  expiresAt: number;
  prepareMs: number;
};
// One pending, worker-owned clone across all producer epochs, never a pinned
// disk record. It is not the foreground clone whose buffers get transferred.
let pendingSeed: CalibrationSeed | null = null;
let seedTimer: ReturnType<typeof setTimeout> | null = null;
let capturingSeed = false;
const clearSeed = (owner: symbol) => {
  if (pendingSeed?.owner !== owner) return;
  pendingSeed = null;
  if (seedTimer !== null) clearTimeout(seedTimer);
  seedTimer = null;
};
const entryBufferBytes = (entry: CachedProjectedTerrainTile) => {
  const tile = entry.tile;
  const arrays = [tile.u, tile.v, tile.heightMeters, tile.indices,
    tile.westIndices, tile.southIndices, tile.eastIndices, tile.northIndices,
    entry.reliefVertexMask];
  if (entry.geometry) arrays.push(entry.geometry.positions, entry.geometry.normals, entry.geometry.indices);
  return [...new Set(arrays.map(array => array.buffer))]
    .reduce((sum, buffer) => sum + buffer.byteLength, 0);
};
const environment = () => typeof navigator === "undefined" ? "no-browser" :
  `${navigator.userAgent}|${navigator.hardwareConcurrency}`;
const sizeClass = (bytes: number) => bytes <= 4 * 1024 ** 2 ? "coarse" : "full";
const isFormat = (value: unknown): value is Format =>
  value === "native" || value === "binary" || value === "meshopt";

/** DBC-04: Worker-local format trials are only a preselection. Every actual
 * foreground restore still reports queue/transfer/reconstruction costs to the
 * shared 5% admission guard. No profile is a cross-device performance promise.
 * Profile and codec work run only after visible shadow/terrain convergence.
 */
export const createProjectedTerrainCacheStrategy = (
  manager: DerivedBufferCache,
  namespace: string,
  version: string,
  validate: (value: unknown) => value is CachedProjectedTerrainTile
) => {
  const records = manager.register(namespace, version);
  const profiles = manager.register("terrain-cache-strategies", PROFILE_VERSION);
  const probes = manager.register("terrain-cache-probes", PROFILE_VERSION);
  const owner = Symbol("terrain-cache-strategy");
  let disposed = false;
  const provenSlowKeys = new Set<string>();
  const profileKey = (bytes: number) => `${environment()}|${version}|${sizeClass(bytes)}`;
  const readProfile = async (bytes: number, touch = true): Promise<Profile | null> => {
    if (typeof navigator === "undefined") return null;
    const key = profileKey(bytes);
    const value = (await (touch ? profiles.get<Profile>(key)
      : profiles.get<Profile>(key, {touch: false})))?.value;
    const age = value ? Date.now() - value.measuredAt : -1;
    return value && value.environment === environment() &&
      value.scope === "worker-storage-restore" && isFormat(value.format) &&
      age >= 0 && age <= PROFILE_TTL_MS ? value : null;
  };
  const encodeFormat = async (entry: CachedProjectedTerrainTile, format: Format) => {
    if (format === "native") return entry;
    const value = format === "meshopt"
      ? await (await import("./projected-terrain-meshopt-codec")).encodeProjectedTerrainMeshoptRecord(entry)
      : entry;
    return {kind: "terrain-component-v1", format,
      payload: encodeTypedBinaryRecord(value, {maxBytes: CACHE_MAX_BYTES})} satisfies StoredRecord;
  };
  const decode = async (value: unknown): Promise<CachedProjectedTerrainTile | null> => {
    if (validate(value)) return value; // Existing native component records.
    if (!value || typeof value !== "object") return null;
    const stored = value as Partial<StoredRecord>;
    if (stored.kind !== "terrain-component-v1" || !(stored.payload instanceof Blob) ||
      (stored.format !== "binary" && stored.format !== "meshopt")) return null;
    try {
      const unpacked = await decodeTypedBinaryRecord(stored.payload, {maxBytes: CACHE_MAX_BYTES});
      const entry = stored.format === "meshopt"
        ? await (await import("./projected-terrain-meshopt-codec")).decodeProjectedTerrainMeshoptRecord(unpacked)
        : unpacked;
      return validate(entry) ? entry : null;
    } catch { return null; }
  };
  let calibrating = false;
  return {
    decode,
    dispose() {
      disposed = true;
      provenSlowKeys.clear();
      clearSeed(owner);
    },
    canWrite(key: string) { return !disposed && !provenSlowKeys.has(key); },
    /** Read two small audit profiles without hits; never load terrain payloads. */
    async inspectProfiles() {
      return {
        backend: "indexeddb" as const,
        scope: "worker-storage-restore" as const,
        profiles: {
          coarse: await readProfile(1, false),
          full: await readProfile(CACHE_MAX_BYTES, false),
        },
        suppressedKeyCount: provenSlowKeys.size,
        pendingSeed: pendingSeed?.owner === owner && pendingSeed.expiresAt > Date.now()
          ? {bytes: pendingSeed.row.bytes, observedReuseCount: pendingSeed.row.hits,
            expiresAt: pendingSeed.expiresAt, prepareMs: pendingSeed.prepareMs}
          : null,
      };
    },
    async updateCosts(key: string, restoreMs: number) {
      // Feedback is a low-priority worker job. Preserve one bounded clone only
      // when normal admission is about to reject a real, measured cache hit.
      if (!disposed && Number.isFinite(restoreMs) && restoreMs > 0) {
        try {
          const started = performance.now();
          const row = (await records.inspect())?.find(candidate => candidate.key === key);
          const policy = await manager.stats();
          if (row && policy && Number.isSafeInteger(row.hits) && row.hits! >= 1 &&
            row.recomputeMs !== undefined && Number.isFinite(row.recomputeMs) && row.recomputeMs >= 0 &&
            !isDerivedCacheSavingSufficient({...row, restoreMs}, policy.minimumSavingRatio)) {
            // A proven-slow exact key must not enter an encode/write/reject
            // loop in this session. This is not a device-wide format blacklist.
            provenSlowKeys.delete(key); provenSlowKeys.add(key);
            if (provenSlowKeys.size > 256) provenSlowKeys.delete(provenSlowKeys.values().next().value!);
            if (!pendingSeed && !capturingSeed && typeof navigator !== "undefined" && navigator.locks &&
              row.recomputeMs > 0 && row.bytes <= CACHE_MAX_BYTES) {
              capturingSeed = true;
              try {
                const hit = await records.get<unknown>(key, {touch: false});
                const entry = hit ? await decode(hit.value) : null;
                const bytes = entry ? Math.max(row.bytes, entryBufferBytes(entry)) : 0;
                if (!disposed && entry && bytes > 0 && bytes <= CACHE_MAX_BYTES) {
                  pendingSeed = {owner, entry, row: {...row, bytes, restoreMs},
                    expiresAt: Date.now() + SEED_TTL_MS, prepareMs: performance.now() - started};
                  seedTimer = setTimeout(() => clearSeed(owner), SEED_TTL_MS);
                }
              } finally { capturingSeed = false; }
            }
          }
        } catch { /* Optional calibration must not prevent normal rejection. */ }
      }
      return records.updateCosts(key, {restoreMs});
    },
    async encode(entry: CachedProjectedTerrainTile, bytes: number) {
      try {
        if (disposed || typeof navigator === "undefined" || typeof Blob === "undefined" ||
          !await manager.stats()) return null;
        const profile = await readProfile(bytes);
        // The complete managed-codec comparison on the target desktop chose
        // binary Blob. Actual-hit feedback still rejects losses on any client.
        const format = profile?.format ?? "binary";
        const payload = await encodeFormat(entry, format);
        return {payload, bytes: "payload" in payload ? payload.payload.size : bytes};
      } catch {
        // Source computation already succeeded; optional persistence must not
        // replace a failed codec with another unmeasured write path.
        return null;
      }
    },
    async calibrate(signal?: AbortSignal) {
      // Native Web Locks bounds profiling to one worker across the origin.
      // No lock support means no automatic codec experiment, not a polyfill.
      if (disposed || calibrating || signal?.aborted || typeof navigator === "undefined" ||
        !navigator.locks) return false;
      calibrating = true;
      try {
        return await navigator.locks.request("carma-terrain-cache-calibration", {
          ifAvailable: true, mode: "exclusive",
        }, async (lock) => {
          if (!lock || signal?.aborted) return false;
          const rows = await records.inspect();
          if (pendingSeed?.owner === owner && pendingSeed.expiresAt <= Date.now()) clearSeed(owner);
          const seed = pendingSeed?.owner === owner ? pendingSeed : null;
          const candidates = [...(seed ? [seed.row] : []), ...(rows ?? []).filter(row => row.key !== seed?.row.key)]
            .filter(row => (row.hits ?? 0) >= 1 &&
            row.bytes <= CACHE_MAX_BYTES && row.recomputeMs !== undefined && row.restoreMs !== undefined);
          for (const row of candidates) {
            if (signal?.aborted) return false;
            const previous = await readProfile(row.bytes);
            if (previous && (previous.format !== "native" ||
              (row.hits ?? 0) < Math.max(2, previous.observedReuseCount * 2))) {
              if (row === seed?.row) clearSeed(owner);
              continue;
            }
            // Calibration reads must not masquerade as real reuse counts.
            const fromSeed = row === seed?.row;
            const stored = fromSeed ? null : await records.get<unknown>(row.key, {touch: false});
            const entry = fromSeed ? seed!.entry : stored ? await decode(stored.value) : null;
            if (!entry) continue;
            if (fromSeed) clearSeed(owner);
            const started = performance.now();
            const keys: string[] = [];
            try {
              const trials: {id: Format; samplesMs: number[]; prepareMs: number; bytes: number; parityVerified: boolean}[] = [];
              for (const format of ["native", "binary", "meshopt"] as const) {
                if (signal?.aborted) return false;
                const start = performance.now();
                const payload = await encodeFormat(entry, format);
                if (signal?.aborted) return false;
                const bytes = "payload" in payload ? payload.payload.size : row.bytes;
                const key = crypto.randomUUID(); keys.push(key);
                // Unknown trials only use spare space; never evict valuable data.
                if (!await probes.put(key, payload, {bytes})) return false;
                const prepareMs = performance.now() - start + (fromSeed ? seed!.prepareMs : 0);
                const samplesMs: number[] = [];
                for (let index = -1; index < 5; index += 1) {
                  if (signal?.aborted) return false;
                  await new Promise<void>(resolve => setTimeout(resolve, 0));
                  if (signal?.aborted) return false;
                  const readStart = performance.now();
                  const hit = await probes.get<unknown>(key, {touch: false});
                  if (signal?.aborted) return false;
                  const restored = hit ? await decode(hit.value) : null;
                  const elapsed = performance.now() - readStart;
                  if (!restored || !equalRecord(entry, restored)) return false;
                  if (index >= 0) samplesMs.push(elapsed);
                }
                trials.push({id: format, samplesMs, prepareMs, bytes, parityVerified: true});
                // One trial payload at a time; retain no extra geometry pyramid.
                await probes.remove(key);
              }
              const baseline = trials.find(trial => trial.id === "native")!;
              const audit = calibrateDerivedCacheStrategies(baseline, trials.filter(trial => trial.id !== "native"), row.hits ?? 0);
              const format = isFormat(audit.winnerId) ? audit.winnerId : "native";
              const profile: Profile = {environment: environment(), measuredAt: Date.now(), format, scope: "worker-storage-restore", observedReuseCount: row.hits ?? 0, audit};
              if (signal?.aborted) return false;
              return profiles.put(profileKey(row.bytes), profile, {
                bytes: new TextEncoder().encode(JSON.stringify(profile)).byteLength,
                recomputeMs: performance.now() - started,
              });
            } finally {
              await Promise.all(keys.map(key => probes.remove(key)));
            }
          }
          return false;
        });
      } finally { calibrating = false; }
    },
  };
};

// Outside timed reads: exact bytes, not just schema or rendered similarity.
const equalRecord = (a: unknown, b: unknown): boolean => {
  if (ArrayBuffer.isView(a)) {
    if (!ArrayBuffer.isView(b) || a.constructor !== b.constructor || a.byteLength !== b.byteLength) return false;
    const left = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    const right = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    return left.every((value, index) => value === right[index]);
  }
  if (a && typeof a === "object") {
    if (!b || typeof b !== "object") return false;
    const left = Object.entries(a); const right = Object.entries(b);
    return left.length === right.length && left.every(([key,value]) =>
      Object.hasOwn(b, key) && equalRecord(value, (b as Record<string, unknown>)[key]));
  }
  return Object.is(a,b);
};
