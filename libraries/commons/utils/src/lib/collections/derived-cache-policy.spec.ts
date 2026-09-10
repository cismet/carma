import { describe, expect, it } from "vitest";

import {
  derivedCacheSavedMilliseconds,
  isDerivedCacheSavingSufficient,
  planDerivedCacheAdmission,
  planDerivedCacheTrim,
  refreshDerivedCacheMetadata,
  resolveDerivedCachePolicy,
  type DerivedCacheMetadata,
  type DerivedCacheRecord,
} from "./derived-cache-policy";

const options = { capacityBytes: 100, age: 0, nowMs: 100 };
const candidate = (key: string, bytes = 20, savedMs = 20): DerivedCacheRecord => ({
  namespace: "terrain", key, version: "v1", bytes,
  recomputeMs: savedMs + 1, restoreMs: 1,
});
const stored = (key: string, bytes = 20, savedMs = 20): DerivedCacheMetadata => ({
  ...candidate(key, bytes, savedMs),
  priority: savedMs / bytes, lastAccess: 1, writtenMs: 1,
});
const unknown = (key: string, bytes = 20): DerivedCacheRecord => ({
  namespace: "terrain", key, version: "v1", bytes,
});

describe("derived component cache external-pressure trim", () => {
  it("releases current usage even when it is far below configured capacity", () => {
    const entries = Object.freeze(Array.from({ length: 5 }, (_, i) => stored(String(i), 2)));
    const plan = planDerivedCacheTrim(entries, 0);
    expect(plan).toMatchObject({ bytes: 8, count: 4, age: 10 });
    expect(plan.evicted.map((record) => record.key)).toEqual(["0"]);
    expect(entries).toHaveLength(5);
  });

  it("evicts unknown entries first, then low priorities, until both targets fit", () => {
    const entries = [
      stored("valuable", 80, 160), stored("cheap", 15, 1),
      { ...unknown("probe", 5), priority: 8, writtenMs: 1, lastAccess: 99 },
    ];
    const plan = planDerivedCacheTrim(entries, 2);
    expect(plan.evicted.map((record) => record.key)).toEqual(["probe", "cheap"]);
    expect(plan).toMatchObject({ bytes: 80, count: 1, age: 8 });
  });

  it("meets the count target even when the first victim met the byte target", () => {
    const entries = [stored("large", 95, 1),
      ...Array.from({ length: 5 }, (_, i) => stored(String(i), 1))];
    const plan = planDerivedCacheTrim(entries, 2);
    expect(plan.evicted.map((record) => record.key)).toEqual(["large", "0"]);
    expect(plan).toMatchObject({ bytes: 4, count: 4, age: 20 });
  });

  it("breaks equal-priority ties by oldest access and does not decrease age", () => {
    const plan = planDerivedCacheTrim([
      { ...stored("newer"), lastAccess: 20 }, stored("older"),
    ], 5);
    expect(plan.evicted.map((record) => record.key)).toEqual(["older"]);
    expect(plan.age).toBe(5);
  });

  it("can release the final indivisible entry and safely handles an empty cache", () => {
    expect(planDerivedCacheTrim([stored("last")], 0))
      .toMatchObject({ bytes: 0, count: 0, age: 1 });
    expect(planDerivedCacheTrim([], 3))
      .toEqual({ evicted: [], bytes: 0, count: 0, age: 3 });
  });
});
describe("derived component cache admission", () => {
  it("uses explicit capacity and bounded, configurable product guards", () => {
    expect(resolveDerivedCachePolicy({ capacityBytes: 100 })).toEqual({
      capacityBytes: 100, maxEntries: 4096,
      lowWaterRatio: 0.8, minimumSavingRatio: 0.05,
    });
    expect(resolveDerivedCachePolicy({ capacityBytes: 100, maxEntries: 10_000 })?.maxEntries)
      .toBe(4096);
  });

  it.each([
    { capacityBytes: 0 }, { capacityBytes: NaN }, { capacityBytes: 1.5 },
    { capacityBytes: 100, maxEntries: 0 },
    { capacityBytes: 100, lowWaterRatio: 0 },
    { capacityBytes: 100, lowWaterRatio: 1.1 },
    { capacityBytes: 100, minimumSavingRatio: -1 },
    { capacityBytes: 100, minimumSavingRatio: NaN },
  ])("rejects invalid configuration %j", (value) => {
    expect(resolveDerivedCachePolicy(value)).toBeNull();
  });

  it("requires both measured costs and never invents a saving", () => {
    expect(derivedCacheSavedMilliseconds({})).toBeNull();
    expect(derivedCacheSavedMilliseconds({ recomputeMs: 100 })).toBeNull();
    expect(derivedCacheSavedMilliseconds({ restoreMs: 1 })).toBeNull();
    expect(derivedCacheSavedMilliseconds({ recomputeMs: 100, restoreMs: 95 })).toBe(5);
    expect(derivedCacheSavedMilliseconds({ recomputeMs: 10, restoreMs: 20 })).toBe(0);
  });

  it.each([
    { restoreMs: 95, admitted: true }, { restoreMs: 96, admitted: false },
    { restoreMs: 100, admitted: false }, { restoreMs: 101, admitted: false },
  ])(
    "applies the requested five-percent guard to %j",
    ({ restoreMs, admitted }) => {
      const record = { ...candidate("a"), recomputeMs: 100, restoreMs };
      expect(Boolean(planDerivedCacheAdmission([], record, options).record)).toBe(admitted);
    }
  );

  it("allows an explicit smaller saving guard but never a nonpositive win", () => {
    const record = { ...candidate("a"), recomputeMs: 100, restoreMs: 99 };
    expect(planDerivedCacheAdmission([], record, {
      ...options, minimumSavingRatio: 0,
    }).record).not.toBeNull();
    expect(isDerivedCacheSavingSufficient({ recomputeMs: 0, restoreMs: 0 }, 0)).toBe(false);
  });

  it("admits unknown work early when bytes and entry slots are free", () => {
    const result = planDerivedCacheAdmission([], unknown("probe"), { ...options, age: 3 });
    expect(result.record?.priority).toBe(3);
    expect(result.bytes).toBe(20);
    expect(result.count).toBe(1);
    expect(result.evicted).toEqual([]);
  });

  it("does not let unknown work evict existing records", () => {
    const result = planDerivedCacheAdmission([stored("old", 100)], unknown("new"), options);
    expect(result.record).toBeNull();
    expect(result.evicted).toEqual([]);
    expect(result.bytes).toBe(100);
  });

  it("evicts unknown records before measured work regardless of recency", () => {
    const unmeasured = { ...unknown("probe", 60), priority: 5, writtenMs: 1, lastAccess: 99 };
    const result = planDerivedCacheAdmission(
      [stored("known", 40, 40), unmeasured], candidate("new", 20, 100),
      { ...options, age: 5 }
    );
    expect(result.evicted.map((record) => record.key)).toEqual(["probe"]);
    expect(result.bytes).toBe(60);
  });

  it("trims to low water for more valuable work and ages by the evicted priorities", () => {
    const result = planDerivedCacheAdmission(
      [stored("cheap", 50, 10), stored("less-cheap", 50, 20)],
      candidate("new", 40, 100), options
    );
    expect(result.evicted.map((record) => record.key)).toEqual(["cheap", "less-cheap"]);
    expect(result.bytes).toBe(40);
    expect(result.age).toBe(0.4);
    expect(result.record?.priority).toBe(2.9);
  });

  it("does not evict more valuable work merely because a cheap entry is new", () => {
    const result = planDerivedCacheAdmission(
      [stored("expensive", 100, 100)], candidate("cheap", 20, 10), options
    );
    expect(result.record).toBeNull();
    expect(result.evicted).toEqual([]);
  });

  it("rejects the entire plan rather than partially evicting on a priority barrier", () => {
    const result = planDerivedCacheAdmission(
      [stored("cheap", 40, 4), stored("expensive", 60, 120)],
      candidate("new", 30, 30), options
    );
    expect(result).toMatchObject({ record: null, evicted: [], bytes: 100, age: 0 });
  });

  it("protects equal-priority entries against admission churn", () => {
    expect(planDerivedCacheAdmission(
      [stored("old", 100, 100)], candidate("new", 20, 20), options
    ).record).toBeNull();
  });

  it("ranks equal saved work by occupied bytes", () => {
    const result = planDerivedCacheAdmission(
      [stored("large", 80, 100), stored("small", 20, 100)],
      candidate("new", 20, 100), options
    );
    expect(result.evicted.map((record) => record.key)).toEqual(["large"]);
  });

  it("allows a useful entry larger than low water to occupy the budget alone", () => {
    const result = planDerivedCacheAdmission(
      [stored("old", 100, 10)], candidate("large", 90, 90), options
    );
    expect(result.record).not.toBeNull();
    expect(result.bytes).toBe(90);
    expect(result.count).toBe(1);
  });

  it("bounds metadata entry count even when the byte budget has room", () => {
    const result = planDerivedCacheAdmission(
      [stored("a"), stored("b")], candidate("new", 20, 100),
      { ...options, capacityBytes: 1_000, maxEntries: 2 }
    );
    expect(result.count).toBe(1);
    expect(result.evicted).toHaveLength(2);
  });

  it("accounts for an atomic version replacement without counting two payloads", () => {
    const result = planDerivedCacheAdmission([stored("same", 90)], {
      ...candidate("same", 100), version: "v2",
    }, options);
    expect(result.record?.version).toBe("v2");
    expect(result.bytes).toBe(100);
    expect(result.count).toBe(1);
    expect(result.evicted).toEqual([]);
  });

  it("keeps identical component keys in different namespaces distinct", () => {
    const result = planDerivedCacheAdmission([stored("same")], {
      ...candidate("same"), namespace: "shadow",
    }, options);
    expect(result.count).toBe(2);
    expect(result.bytes).toBe(40);
  });

  it("refreshes priority on hits without rewriting the original write time", () => {
    const record = Object.freeze(stored("a"));
    const next = refreshDerivedCacheMetadata(record, 5, 999);
    expect(next.priority).toBe(6);
    expect(next.lastAccess).toBe(999);
    expect(next.writtenMs).toBe(1);
    expect(record.priority).toBe(1);
  });

  it.each([
    { bytes: 0 }, { bytes: 101 }, { bytes: 1.5 }, { bytes: NaN },
    { recomputeMs: -1 }, { restoreMs: Infinity }, { namespace: "" },
  ])("rejects invalid or oversized records %j", (invalid) => {
    expect(planDerivedCacheAdmission([], { ...candidate("a"), ...invalid }, options).record)
      .toBeNull();
  });
});
