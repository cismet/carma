import {
  readCacheCeilingMemory,
  type CacheCeilingMemory,
} from "./three-tiles-cache-ceiling-memory";

/** Called at the existing memory-check cadence, including for same-tab peers
 * (which do not receive storage events). Only durable lessons cross runtimes;
 * a local probe and a stricter local lesson remain owned by their runtime.
 */
export const synchronizeSharedCacheCeiling = (
  storage: Storage | null,
  local: CacheCeilingMemory | null
): CacheCeilingMemory | null => {
  if (!storage || !local) return local;
  const shared = readCacheCeilingMemory(storage, local.buildId);
  if (
    shared.learnedBytes === null ||
    (local.learnedBytes !== null && local.learnedBytes <= shared.learnedBytes)
  )
    return local;
  return {
    ...local,
    learnedBytes: shared.learnedBytes,
    reason: shared.reason,
  };
};
