import { createDerivedBufferCache } from "@carma-commons/utils";

const FALLBACK_CAPACITY_BYTES = 256 * 1024 ** 2;

/** All prepared tiles and their metadata share one origin-storage policy.
 * Producer epochs remain independent: the caller supplies its immutable graph
 * identity and source/configuration identity remains in each registered record.
 * This disk quota never substitutes for live CPU/GPU residency budgets.
 */
export const createPersistentTileCache = (producerEpoch: string) =>
  createDerivedBufferCache({
    capacityBytes: FALLBACK_CAPACITY_BYTES,
    adaptiveCapacity: true,
    producerEpoch,
  });
