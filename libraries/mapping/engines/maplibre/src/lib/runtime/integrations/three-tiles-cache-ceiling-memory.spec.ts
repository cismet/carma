import { describe, expect, it } from "vitest";
import {
  cacheCeilingBuildId,
  cacheCeilingStorageKey,
  EMPTY_CACHE_CEILING_MEMORY,
  endCacheCeilingSession,
  learnCacheCeiling,
  readCacheCeilingMemory,
  recordCacheCeilingPeak,
  normalizeCacheCeilingMemory,
  startCacheCeilingSession,
  writeCacheCeilingMemory,
} from "./three-tiles-cache-ceiling-memory";
import { TILES_CACHE_CEILING_BYTES } from "../../core/tile-cache-policy";

const MIB = 1024 ** 2;
const GIB = 1024 ** 3;
const fakeStorage = () => {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    clear: () => items.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
};

describe("cache ceiling memory", () => {
  it("round-trips through storage and tolerates garbage", () => {
    const storage = fakeStorage();
    expect(readCacheCeilingMemory(storage)).toEqual(EMPTY_CACHE_CEILING_MEMORY);
    storage.setItem(cacheCeilingStorageKey(), "{not json");
    expect(readCacheCeilingMemory(storage)).toEqual(EMPTY_CACHE_CEILING_MEMORY);
    const learned = learnCacheCeiling(
      EMPTY_CACHE_CEILING_MEMORY,
      3 * GIB,
      "allocation"
    );
    writeCacheCeilingMemory(storage, learned);
    expect(readCacheCeilingMemory(storage)).toEqual(learned);
    expect(readCacheCeilingMemory(null)).toEqual(EMPTY_CACHE_CEILING_MEMORY);
  });

  it("shares client limits without sharing any running session probe", () => {
    const storage = fakeStorage();
    const first = recordCacheCeilingPeak(
      startCacheCeilingSession(
        learnCacheCeiling(EMPTY_CACHE_CEILING_MEMORY, 2 * GIB, "allocation"),
        2 * GIB,
        1000
      ),
      GIB
    );
    writeCacheCeilingMemory(storage, first);
    const second = startCacheCeilingSession(
      readCacheCeilingMemory(storage),
      2 * GIB,
      2000
    );
    expect(second.learnedBytes).toBe(2 * GIB);
    expect(second.probe).toMatchObject({ peakBytes: 0, startedAt: 2000 });
    expect(first.probe).toMatchObject({ peakBytes: GIB, startedAt: 1000 });
    writeCacheCeilingMemory(storage, second);
    expect(readCacheCeilingMemory(storage).probe).toBeNull();
    expect(first.probe?.peakBytes).toBe(GIB);
  });

  it("only lowers a learned ceiling and never below the floor", () => {
    const first = learnCacheCeiling(
      EMPTY_CACHE_CEILING_MEMORY,
      2 * GIB,
      "allocation"
    );
    expect(first.learnedBytes).toBe(2 * GIB);
    expect(learnCacheCeiling(first, 3 * GIB, "context-lost")).toBe(first);
    const lower = learnCacheCeiling(first, 10 * MIB, "context-lost");
    expect(lower.learnedBytes).toBe(TILES_CACHE_CEILING_BYTES.floor);
    expect(lower.reason).toBe("context-lost");
  });

  it("does not treat another live manager's shared probe as a memory failure", () => {
    const storage = fakeStorage();
    const active = recordCacheCeilingPeak(
      startCacheCeilingSession(EMPTY_CACHE_CEILING_MEMORY, 6 * GIB, 1000),
      400 * MIB
    );
    writeCacheCeilingMemory(storage, active);
    const second = normalizeCacheCeilingMemory(readCacheCeilingMemory(storage));
    expect(second.learnedBytes).toBeNull();
    expect(second.probe).toBeNull();
    expect(active.probe?.peakBytes).toBe(400 * MIB);
    const explicit = learnCacheCeiling(active, 2 * GIB, "allocation");
    expect(normalizeCacheCeilingMemory(explicit)).toBe(explicit);
  });

  it("migrates legacy inferred limits without dropping confirmed failure limits", () => {
    const legacy = learnCacheCeiling(
      EMPTY_CACHE_CEILING_MEMORY,
      200 * MIB,
      "unhealthy-session"
    );
    expect(normalizeCacheCeilingMemory(legacy)).toMatchObject({
      learnedBytes: null,
      reason: null,
    });
    const confirmed = learnCacheCeiling(
      EMPTY_CACHE_CEILING_MEMORY,
      200 * MIB,
      "context-lost"
    );
    expect(normalizeCacheCeilingMemory(confirmed)).toBe(confirmed);
  });

  it("does not let an older live bundle overwrite a newer bundle's failure limit", () => {
    const storage = fakeStorage();
    const oldBuild = { ...EMPTY_CACHE_CEILING_MEMORY, buildId: "old-bundle" };
    const newBuild = { ...EMPTY_CACHE_CEILING_MEMORY, buildId: "new-bundle" };
    writeCacheCeilingMemory(
      storage,
      learnCacheCeiling(newBuild, 2 * GIB, "allocation")
    );
    writeCacheCeilingMemory(
      storage,
      learnCacheCeiling(oldBuild, 5 * GIB, "allocation")
    );
    expect(readCacheCeilingMemory(storage, "new-bundle").learnedBytes).toBe(
      2 * GIB
    );
    expect(readCacheCeilingMemory(storage, "old-bundle").learnedBytes).toBe(
      5 * GIB
    );
    expect(readCacheCeilingMemory(storage).learnedBytes).toBeNull();
  });

  it("retains confirmed limits through healthy sessions until the bundle changes", () => {
    const storage = fakeStorage();
    let memory = learnCacheCeiling(
      EMPTY_CACHE_CEILING_MEMORY,
      2 * GIB,
      "allocation"
    );
    for (let run = 0; run < 5; run++) {
      memory = endCacheCeilingSession(
        recordCacheCeilingPeak(
          startCacheCeilingSession(memory, 2 * GIB, run),
          2 * GIB
        )
      );
      expect(memory.learnedBytes).toBe(2 * GIB);
    }
    writeCacheCeilingMemory(storage, memory);
    expect(readCacheCeilingMemory(storage).learnedBytes).toBe(2 * GIB);
    expect(
      readCacheCeilingMemory(storage, "new-bundle").learnedBytes
    ).toBeNull();
    expect(readCacheCeilingMemory(storage, "new-bundle").probe).toBeNull();
    expect(
      cacheCeilingBuildId("https://app.test/assets/runtime-abc.js?t=1#debug")
    ).toBe(cacheCeilingBuildId("https://app.test/assets/runtime-abc.js?t=2"));
    expect(
      cacheCeilingBuildId("https://app.test/assets/runtime-def.js")
    ).not.toBe(cacheCeilingBuildId("https://app.test/assets/runtime-abc.js"));
    storage.setItem(
      cacheCeilingStorageKey(),
      JSON.stringify({ ...memory, version: 1 })
    );
    expect(readCacheCeilingMemory(storage).learnedBytes).toBeNull();
  });
});
