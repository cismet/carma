import { describe, expect, it } from "vitest";
import {
  CACHE_CEILING_STORAGE_KEY,
  EMPTY_CACHE_CEILING_MEMORY,
  endCacheCeilingSession,
  learnCacheCeiling,
  readCacheCeilingMemory,
  recordCacheCeilingPeak,
  settleCrashedCacheCeilingSession,
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
    storage.setItem(CACHE_CEILING_STORAGE_KEY, "{not json");
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

  it("treats a session without a clean end as a crash and learns half its peak", () => {
    const started = startCacheCeilingSession(
      EMPTY_CACHE_CEILING_MEMORY,
      6 * GIB,
      1000
    );
    const used = recordCacheCeilingPeak(
      recordCacheCeilingPeak(started, 4 * GIB),
      3 * GIB
    );
    expect(used.probe?.peakBytes).toBe(4 * GIB);
    // The tab was killed: the next start finds the probe unhealthy.
    const settled = settleCrashedCacheCeilingSession(used);
    expect(settled.learnedBytes).toBe(2 * GIB);
    expect(settled.reason).toBe("unhealthy-session");
    // A clean end leaves nothing to settle.
    const ended = endCacheCeilingSession(used, 6 * GIB);
    expect(settleCrashedCacheCeilingSession(ended)).toBe(ended);
    expect(settleCrashedCacheCeilingSession(EMPTY_CACHE_CEILING_MEMORY)).toBe(
      EMPTY_CACHE_CEILING_MEMORY
    );
  });

  it("recovers a well-used learned ceiling after three clean sessions", () => {
    let memory = learnCacheCeiling(
      EMPTY_CACHE_CEILING_MEMORY,
      2 * GIB,
      "allocation"
    );
    for (let run = 0; run < 2; run += 1) {
      memory = endCacheCeilingSession(
        recordCacheCeilingPeak(
          startCacheCeilingSession(memory, 2 * GIB, run),
          1.9 * GIB
        ),
        6 * GIB
      );
      expect(memory.learnedBytes).toBe(2 * GIB);
      expect(memory.healthyRuns).toBe(run + 1);
    }
    memory = endCacheCeilingSession(
      recordCacheCeilingPeak(
        startCacheCeilingSession(memory, 2 * GIB, 2),
        1.9 * GIB
      ),
      6 * GIB
    );
    expect(memory.learnedBytes).toBe(3 * GIB);
    expect(memory.healthyRuns).toBe(0);
    // A lightly used session does not count towards recovery.
    const idle = endCacheCeilingSession(
      recordCacheCeilingPeak(
        startCacheCeilingSession(memory, 3 * GIB, 3),
        1 * GIB
      ),
      6 * GIB
    );
    expect(idle.healthyRuns).toBe(0);
    // Reaching the unlearned ceiling forgets the lesson.
    let recovered = memory;
    for (let run = 0; run < 6; run += 1)
      recovered = endCacheCeilingSession(
        recordCacheCeilingPeak(
          startCacheCeilingSession(recovered, 6 * GIB, run),
          6 * GIB
        ),
        4 * GIB
      );
    expect(recovered.learnedBytes).toBeNull();
  });
});
