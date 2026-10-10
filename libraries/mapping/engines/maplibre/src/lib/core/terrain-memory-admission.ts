/** Memory pressure defers detail; it is neither a missing tile nor a load error. */
export class TerrainMemoryDeferredError extends Error {
  constructor(readonly requiredBytes?: number) {
    super("Terrain detail exceeds the resident memory grant");
    this.name = "TerrainMemoryDeferredError";
  }
}

/** Gather a direct family across priority/stage boundaries before any child runs. */
export const planTerrainAdmissionFamilies = <Entry>(
  stages: readonly (readonly Entry[])[],
  key: (entry: Entry) => string,
  parentKey: (entry: Entry) => string,
  residentEntries: readonly Entry[] = []
): ReadonlyMap<string, readonly string[]> => {
  const groups = new Map<string, Set<string>>();
  for (const entry of stages.flat()) {
    const parent = parentKey(entry);
    const family = groups.get(parent) ?? new Set<string>();
    family.add(key(entry));
    groups.set(parent, family);
  }
  // Include already prepared siblings in rollback ownership without scheduling
  // them again or introducing families absent from foreground demand.
  for (const entry of residentEntries)
    groups.get(parentKey(entry))?.add(key(entry));
  const families = new Map<string, readonly string[]>();
  for (const members of groups.values()) {
    const keys = [...members];
    for (const member of keys) families.set(member, keys);
  }
  return families;
};

/** Reservations bound retained terrain, not transient decoder/worker allocations. */
export const createTerrainMemoryAdmission = (
  read: Readonly<{
    residentBytes: () => number;
    grantBytes: () => number;
    initialEstimateBytes: number;
    resident: (key: string) => boolean;
  }>
) => {
  const reservations = new Map<string, number>();
  const families = new Map<string, readonly string[]>();
  const deferred = new Set<string>();
  let estimate = Math.max(0, read.initialEstimateBytes);
  let observed = false;
  const reservedBytes = () =>
    [...reservations.values()].reduce((sum, bytes) => sum + bytes, 0);
  const release = (key: string) => void reservations.delete(key);
  return {
    reservedBytes,
    forecastFamilyBytes: (keys: readonly string[], firstCoverage = false) =>
      firstCoverage
        ? 0
        : [...new Set(keys)].filter(
            (key) => !read.resident(key) && !reservations.has(key)
          ).length * estimate,
    hasReservation: (key: string) => reservations.has(key),
    isDeferred: (key: string) => deferred.has(key),
    resetDeferred: () => deferred.clear(),
    family: (key: string) => families.get(key) ?? [key],
    reserveFamily: (keys: readonly string[], firstCoverage = false) => {
      if (keys.some((key) => deferred.has(key))) return false;
      const unique = [...new Set(keys)];
      const missing = unique.filter(
        (key) => !read.resident(key) && !reservations.has(key)
      );
      const forecast = firstCoverage ? 0 : estimate;
      if (
        read.residentBytes() + reservedBytes() + missing.length * forecast >
        read.grantBytes()
      ) {
        for (const key of unique) deferred.add(key);
        return false;
      }
      for (const key of unique) families.set(key, unique);
      for (const key of missing) reservations.set(key, forecast);
      return true;
    },
    canInstall: (key: string, bytes: number) =>
      Number.isFinite(bytes) &&
      bytes >= 0 &&
      !deferred.has(key) &&
      read.residentBytes() +
        reservedBytes() -
        (reservations.get(key) ?? 0) +
        bytes <=
        read.grantBytes(),
    installed: (key: string, bytes: number) => {
      release(key);
      if (!Number.isFinite(bytes) || bytes < 0) return;
      estimate = observed ? Math.max(estimate, bytes) : bytes;
      observed = true;
    },
    release,
    rejectFamily: (key: string): readonly string[] => {
      const keys = families.get(key) ?? [key];
      for (const member of keys) {
        release(member);
        deferred.add(member);
      }
      return keys;
    },
    reconcile: (required: ReadonlySet<string>) => {
      for (const key of reservations.keys())
        if (!required.has(key)) release(key);
      for (const key of families.keys())
        if (!required.has(key)) families.delete(key);
      for (const key of deferred) if (!required.has(key)) deferred.delete(key);
    },
  };
};
