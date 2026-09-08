/** DBC-01: measured saved work per byte; see ./DERIVED_CACHE_DECISIONS.md.
 * Costs are milliseconds measured by the caller at consistent restore/recompute
 * boundaries. This policy never substitutes estimated wins for missing timings.
 */
export const DERIVED_CACHE_DEFAULTS = {
  databaseName: "carma-derived-buffer-cache",
  maxEntries: 4096,
  lowWaterRatio: 0.8,
  // Explicit product guard, not a universal storage-performance threshold.
  minimumSavingRatio: 0.05,
} as const;

export type DerivedCachePolicyOptions = Readonly<{
  capacityBytes: number;
  maxEntries?: number;
  lowWaterRatio?: number;
  minimumSavingRatio?: number;
}>;

export type DerivedCacheCosts = Readonly<{
  recomputeMs?: number;
  restoreMs?: number;
}>;

export type DerivedCacheRecord = DerivedCacheCosts &
  Readonly<{ namespace: string; key: string; version: string; bytes: number }>;

export type DerivedCacheMetadata = DerivedCacheRecord &
  Readonly<{ priority: number; lastAccess: number; writtenMs: number; hits?: number }>;

export const resolveDerivedCachePolicy = (options: DerivedCachePolicyOptions) => {
  const maxEntries = options.maxEntries ?? DERIVED_CACHE_DEFAULTS.maxEntries;
  const lowWaterRatio =
    options.lowWaterRatio ?? DERIVED_CACHE_DEFAULTS.lowWaterRatio;
  const minimumSavingRatio =
    options.minimumSavingRatio ?? DERIVED_CACHE_DEFAULTS.minimumSavingRatio;
  if (
    !Number.isSafeInteger(options.capacityBytes) ||
    options.capacityBytes <= 0 ||
    !Number.isSafeInteger(maxEntries) || maxEntries <= 0 ||
    !(lowWaterRatio > 0 && lowWaterRatio <= 1) ||
    !(minimumSavingRatio >= 0 && minimumSavingRatio <= 1)
  ) {
    return null;
  }
  return {
    capacityBytes: options.capacityBytes,
    maxEntries: Math.min(maxEntries, DERIVED_CACHE_DEFAULTS.maxEntries),
    lowWaterRatio,
    minimumSavingRatio,
  };
};

export const derivedCacheSavedMilliseconds = (costs: DerivedCacheCosts) =>
  costs.recomputeMs === undefined || costs.restoreMs === undefined
    ? null
    : Math.max(0, costs.recomputeMs - costs.restoreMs);

export const isDerivedCacheSavingSufficient = (
  costs: DerivedCacheCosts,
  minimumSavingRatio: number = DERIVED_CACHE_DEFAULTS.minimumSavingRatio
) => {
  const saved = derivedCacheSavedMilliseconds(costs);
  return saved === null ||
    (saved > 0 && costs.restoreMs! <= costs.recomputeMs! * (1 - minimumSavingRatio));
};

export const isDerivedCacheRecordValid = (record: DerivedCacheRecord) =>
  [record.namespace, record.key, record.version].every(
    (value) => typeof value === "string" && value.length > 0
  ) &&
  Number.isSafeInteger(record.bytes) && record.bytes > 0 &&
  [record.recomputeMs, record.restoreMs].every(
    (value) => value === undefined || (Number.isFinite(value) && value >= 0)
  );

export const refreshDerivedCacheMetadata = (
  record: DerivedCacheMetadata,
  age: number,
  nowMs: number
): DerivedCacheMetadata => ({
  ...record,
  priority: age + (derivedCacheSavedMilliseconds(record) ?? 0) / record.bytes,
  lastAccess: nowMs,
});

export type DerivedCacheAdmission = Readonly<{
  record: DerivedCacheMetadata | null;
  evicted: readonly DerivedCacheMetadata[];
  age: number;
  bytes: number;
  count: number;
}>;

const compareEvictionPriority = (a: DerivedCacheMetadata, b: DerivedCacheMetadata) =>
  Number(derivedCacheSavedMilliseconds(b) === null) -
    Number(derivedCacheSavedMilliseconds(a) === null) ||
  a.priority - b.priority || a.lastAccess - b.lastAccess;

/** External quota pressure: release 20% of current bytes AND entry count,
 * independently of configured capacity. Whole records may release more.
 */
export const planDerivedCacheTrim = (
  entries: readonly DerivedCacheMetadata[],
  initialAge: number
): Omit<DerivedCacheAdmission, "record"> => {
  let bytes = entries.reduce((sum, record) => sum + record.bytes, 0);
  let count = entries.length;
  let age = initialAge;
  const evicted: DerivedCacheMetadata[] = [];
  const targetBytes = Math.floor(bytes * DERIVED_CACHE_DEFAULTS.lowWaterRatio);
  const targetCount = Math.floor(count * DERIVED_CACHE_DEFAULTS.lowWaterRatio);
  if (Number.isFinite(age) && age >= 0) {
    for (const victim of [...entries].sort(compareEvictionPriority)) {
      if (bytes <= targetBytes && count <= targetCount) break;
      evicted.push(victim);
      bytes -= victim.bytes;
      count -= 1;
      age = Math.max(age, victim.priority);
    }
  }
  return { evicted, age, bytes, count };
};

export const planDerivedCacheAdmission = (
  entries: readonly DerivedCacheMetadata[],
  candidate: DerivedCacheRecord,
  options: DerivedCachePolicyOptions & Readonly<{ age: number; nowMs: number }>
): DerivedCacheAdmission => {
  const totalBytes = entries.reduce((sum, record) => sum + record.bytes, 0);
  const rejected: DerivedCacheAdmission = {
    record: null,
    evicted: [],
    age: options.age,
    bytes: totalBytes,
    count: entries.length,
  };
  const policy = resolveDerivedCachePolicy(options);
  if (
    !policy || !isDerivedCacheRecordValid(candidate) ||
    candidate.bytes > policy.capacityBytes ||
    !Number.isFinite(options.age) || options.age < 0 ||
    !Number.isFinite(options.nowMs)
  ) return rejected;
  const savedMs = derivedCacheSavedMilliseconds(candidate);
  if (!isDerivedCacheSavingSufficient(candidate, policy.minimumSavingRatio))
    return rejected;
  const priority = options.age + (savedMs ?? 0) / candidate.bytes;
  if (!Number.isFinite(priority)) return rejected;
  const remaining = entries.filter(
    (entry) =>
      entry.namespace !== candidate.namespace || entry.key !== candidate.key
  );
  let bytes = remaining.reduce(
    (sum, record) => sum + record.bytes, candidate.bytes
  );
  let count = remaining.length + 1;
  let age = options.age;
  const evicted: DerivedCacheMetadata[] = [];
  if (bytes > policy.capacityBytes || count > policy.maxEntries) {
    if (savedMs === null) return rejected;
    const targetBytes = Math.max(
      candidate.bytes,
      Math.floor(policy.capacityBytes * policy.lowWaterRatio)
    );
    const targetCount = count > policy.maxEntries
      ? Math.max(1, Math.floor(policy.maxEntries * policy.lowWaterRatio))
      : policy.maxEntries;
    const victims = [...remaining].sort(compareEvictionPriority);
    for (const victim of victims) {
      if (bytes <= targetBytes && count <= targetCount) break;
      if (
        derivedCacheSavedMilliseconds(victim) !== null &&
        victim.priority >= priority
      ) return rejected;
      evicted.push(victim);
      bytes -= victim.bytes;
      count -= 1;
      age = Math.max(age, victim.priority);
    }
    if (bytes > targetBytes || count > targetCount) return rejected;
  }
  const finalPriority = age + (savedMs ?? 0) / candidate.bytes;
  if (!Number.isFinite(finalPriority)) return rejected;
  return {
    record: {
      ...candidate,
      writtenMs: options.nowMs,
      lastAccess: options.nowMs,
      priority: finalPriority,
    },
    evicted,
    age,
    bytes,
    count,
  };
};
