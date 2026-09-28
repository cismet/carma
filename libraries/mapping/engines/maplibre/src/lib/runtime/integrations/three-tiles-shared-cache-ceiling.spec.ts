import { describe, expect, it } from "vitest";
import {
  EMPTY_CACHE_CEILING_MEMORY,
  learnCacheCeiling,
  recordCacheCeilingPeak,
  startCacheCeilingSession,
  writeCacheCeilingMemory,
} from "./three-tiles-cache-ceiling-memory";
import { synchronizeSharedCacheCeiling } from "./three-tiles-shared-cache-ceiling";

const GIB = 1024 ** 3;
const storageFixture = () => {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, value),
    removeItem: (key: string) => void entries.delete(key),
    clear: () => entries.clear(),
    key: () => null,
    get length() {
      return entries.size;
    },
  } satisfies Storage;
};

describe("shared cache-ceiling synchronization", () => {
  it("adopts a peer failure after both runtimes start, preserving the second runtime's probe", () => {
    const storage = storageFixture();
    const first = startCacheCeilingSession(
      EMPTY_CACHE_CEILING_MEMORY,
      6 * GIB,
      10
    );
    const second = recordCacheCeilingPeak(
      startCacheCeilingSession(EMPTY_CACHE_CEILING_MEMORY, 6 * GIB, 20),
      5 * GIB
    );
    expect(synchronizeSharedCacheCeiling(storage, second)).toBe(second);
    writeCacheCeilingMemory(
      storage,
      learnCacheCeiling(first, 4 * GIB, "allocation")
    );
    const updated = synchronizeSharedCacheCeiling(storage, second)!;
    expect(updated.learnedBytes).toBe(4 * GIB);
    expect(updated.reason).toBe("allocation");
    expect(updated.probe).toBe(second.probe);
    expect(updated.probe?.startedAt).toBe(20);
    expect(updated.probe?.peakBytes).toBe(5 * GIB);
    expect(second.learnedBytes).toBeNull();
    expect(synchronizeSharedCacheCeiling(storage, updated)).toBe(updated);
  });

  it("ignores another bundle and never raises a stricter live limit", () => {
    const storage = storageFixture();
    const local = learnCacheCeiling(
      EMPTY_CACHE_CEILING_MEMORY,
      3 * GIB,
      "allocation"
    );
    writeCacheCeilingMemory(
      storage,
      learnCacheCeiling(
        { ...EMPTY_CACHE_CEILING_MEMORY, buildId: "another-bundle" },
        GIB,
        "allocation"
      )
    );
    expect(synchronizeSharedCacheCeiling(storage, local)).toBe(local);
    writeCacheCeilingMemory(
      storage,
      learnCacheCeiling(EMPTY_CACHE_CEILING_MEMORY, 4 * GIB, "context-lost")
    );
    expect(synchronizeSharedCacheCeiling(storage, local)).toBe(local);
    writeCacheCeilingMemory(
      storage,
      learnCacheCeiling(EMPTY_CACHE_CEILING_MEMORY, 2 * GIB, "context-lost")
    );
    expect(synchronizeSharedCacheCeiling(storage, local)).toMatchObject({
      learnedBytes: 2 * GIB,
      reason: "context-lost",
      buildId: local.buildId,
    });
    expect(synchronizeSharedCacheCeiling(null, local)).toBe(local);
    expect(synchronizeSharedCacheCeiling(storage, null)).toBeNull();
  });
});
