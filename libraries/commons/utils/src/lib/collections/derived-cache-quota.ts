/** DBC-01 quota follow-up: ./DERIVED_CACHE_DECISIONS.md. Origin estimates are
 * capacity observations, not reservations or RAM/GPU memory measurements.
 */
export const DERIVED_CACHE_QUOTA_POLICY = {
  minimumHeadroomBytes: 256 * 1024 ** 2,
  headroomRatio: 0.1,
  refreshIntervalMs: 60_000,
  estimateDeadlineMs: 2_000,
} as const;

export type DerivedCacheQuotaSample = Readonly<{
  sampledAt: number;
  quota?: number;
  usage?: number;
  managedBytes?: number;
}>;

const validBytes = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value) && value >= 0 &&
  value <= Number.MAX_SAFE_INTEGER;

export const resolveDerivedCacheQuotaCapacity = (
  configuredBytes: number,
  sample?: DerivedCacheQuotaSample
) => {
  const fallback = {
    capacityBytes: configuredBytes,
    capacitySource: "configured-fallback" as const,
    quotaBytes: null,
    usageBytes: null,
    otherUsageBytes: null,
    headroomBytes: null,
  };
  if (!sample || !validBytes(sample.quota) || sample.quota <= 0 ||
      !validBytes(sample.usage)) return fallback;
  // Missing accounting is conservative: do not claim existing bytes as ours.
  const managed = validBytes(sample.managedBytes)
    ? Math.min(sample.managedBytes, sample.usage) : 0;
  const otherUsageBytes = sample.usage - managed;
  const headroomBytes = Math.max(
    DERIVED_CACHE_QUOTA_POLICY.minimumHeadroomBytes,
    Math.ceil(sample.quota * DERIVED_CACHE_QUOTA_POLICY.headroomRatio)
  );
  return {
    capacityBytes: Math.max(0, Math.floor(sample.quota - otherUsageBytes - headroomBytes)),
    capacitySource: "origin-quota" as const,
    quotaBytes: sample.quota,
    usageBytes: sample.usage,
    otherUsageBytes,
    headroomBytes,
  };
};

type QuotaSamplerOptions = Readonly<{
  estimate?: () => Promise<StorageEstimate>;
  now?: () => number;
}>;

/** Returns immediately. The first operation uses the configured fallback;
 * estimates resolve in the background without awaiting inside IndexedDB transactions.
 * The managed-byte snapshot belongs to the estimate, not later cache growth.
 */
export const createDerivedCacheQuotaSampler = (
  options: QuotaSamplerOptions = {}
) => {
  const now = options.now ?? Date.now;
  const estimate = options.estimate ?? (() => {
    const storage = typeof navigator === "undefined" ? undefined : navigator.storage;
    return typeof storage?.estimate === "function" ? storage.estimate() : Promise.resolve({});
  });
  let sample: DerivedCacheQuotaSample | undefined;
  let invalidatedAt = -1;
  let pending = false;
  let generation = 0;
  let closed = false;
  let cancelPending: (() => void) | undefined;

  const refresh = (managedBytes: number) => {
    pending = true;
    const requestGeneration = generation;
    const sampledAt = now();
    let done = false;
    const finish = (value: StorageEstimate = {}) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cancelPending = undefined;
      pending = false;
      if (closed || generation !== requestGeneration) return;
      sample = { sampledAt, quota: value?.quota, usage: value?.usage, managedBytes };
    };
    const timer = setTimeout(finish, DERIVED_CACHE_QUOTA_POLICY.estimateDeadlineMs);
    cancelPending = () => { done = true; pending = false; clearTimeout(timer); };
    // A microtask also keeps a throwing/unsupported API out of the transaction.
    void Promise.resolve().then(estimate).then(finish, () => finish());
  };

  return {
    read(
      managedBytes: number,
      sharedSample?: DerivedCacheQuotaSample,
      sharedInvalidatedAt = -1
    ) {
      if (sharedInvalidatedAt > invalidatedAt) {
        invalidatedAt = sharedInvalidatedAt;
        sample = undefined;
        generation++;
        cancelPending?.();
      }
      if (sharedSample && Number.isFinite(sharedSample.sampledAt) &&
          sharedSample.sampledAt > invalidatedAt && sharedSample.sampledAt <= now() &&
          (!sample || sharedSample.sampledAt > sample.sampledAt)) sample = sharedSample;
      const fresh = sample && sample.sampledAt >= invalidatedAt &&
        now() - sample.sampledAt < DERIVED_CACHE_QUOTA_POLICY.refreshIntervalMs;
      if (!closed && !pending && !fresh) refresh(managedBytes);
      // Preserve the last observation through the bounded refresh; a routine
      // TTL expiry must not suddenly make a multi-GiB cache look over budget.
      return fresh || pending ? sample : undefined;
    },
    invalidate() {
      invalidatedAt = now(); sample = undefined; generation++;
      cancelPending?.();
      return invalidatedAt;
    },
    get invalidatedAt() { return invalidatedAt; },
    close() { closed = true; generation++; cancelPending?.(); },
  };
};
