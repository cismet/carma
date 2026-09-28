import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDerivedCacheQuotaSampler,
  DERIVED_CACHE_QUOTA_POLICY,
  resolveDerivedCacheQuotaCapacity,
} from "./derived-cache-quota";

const GIB = 1024 ** 3;
const fallback = 256 * 1024 ** 2;
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("derived cache origin quota capacity", () => {
  it("subtracts other origin data without counting managed bytes twice", () => {
    const result = resolveDerivedCacheQuotaCapacity(fallback, {
      quota: 10 * GIB, usage: 4 * GIB, managedBytes: 2 * GIB, sampledAt: 0,
    });
    expect(result).toMatchObject({
      capacityBytes: 7 * GIB, otherUsageBytes: 2 * GIB,
      headroomBytes: GIB, capacitySource: "origin-quota",
    });
  });
  it("treats missing managed accounting as other usage", () => {
    expect(resolveDerivedCacheQuotaCapacity(fallback, {
      quota: 10 * GIB, usage: 4 * GIB, sampledAt: 0,
    }).capacityBytes).toBe(5 * GIB);
  });
  it("never credits managed accounting above reported total usage", () => {
    expect(resolveDerivedCacheQuotaCapacity(fallback, {
      quota: 10 * GIB, usage: GIB, managedBytes: 20 * GIB, sampledAt: 0,
    }).capacityBytes).toBe(9 * GIB);
  });
  it.each([0, -1, NaN, Infinity, undefined])("falls back for invalid quota %s", quota => {
    expect(resolveDerivedCacheQuotaCapacity(fallback, { quota, usage: 0, sampledAt: 0 }))
      .toMatchObject({ capacityBytes: fallback, capacitySource: "configured-fallback" });
  });
  it.each([-1, NaN, Infinity, undefined])("falls back for invalid usage %s", usage => {
    expect(resolveDerivedCacheQuotaCapacity(fallback, { quota: GIB, usage, sampledAt: 0 }).capacityBytes)
      .toBe(fallback);
  });
  it("uses the minimum reserve and permits zero new-write capacity", () => {
    expect(resolveDerivedCacheQuotaCapacity(fallback, {
      quota: GIB, usage: GIB - fallback + 1, managedBytes: 0, sampledAt: 0,
    }).capacityBytes).toBe(0);
    expect(resolveDerivedCacheQuotaCapacity(fallback, {
      quota: GIB, usage: 2 * GIB, sampledAt: 0,
    }).capacityBytes).toBe(0);
  });
});

describe("background quota sampling", () => {
  it("does not block reads and keeps the accounting snapshot from estimate start", async () => {
    let resolve!: (value: StorageEstimate) => void;
    const estimate = vi.fn(() => new Promise<StorageEstimate>(done => { resolve = done; }));
    const sampler = createDerivedCacheQuotaSampler({ estimate, now: () => 1 });
    expect(sampler.read(2 * GIB)).toBeUndefined();
    await Promise.resolve();
    expect(sampler.read(3 * GIB)).toBeUndefined();
    resolve({ quota: 10 * GIB, usage: 4 * GIB });
    await vi.waitFor(() => expect(sampler.read(3 * GIB)?.managedBytes).toBe(2 * GIB));
    expect(estimate).toHaveBeenCalledTimes(1);
    sampler.close();
  });
  it("reuses shared fresh samples but refreshes stale or quota-invalidated ones", async () => {
    let now = 5;
    const estimate = vi.fn(async () => ({ quota: 10 * GIB, usage: GIB }));
    const sampler = createDerivedCacheQuotaSampler({ estimate, now: () => now });
    const shared = { sampledAt: 1, quota: 10 * GIB, usage: GIB, managedBytes: 0 };
    expect(sampler.read(0, shared)).toEqual(shared);
    expect(estimate).not.toHaveBeenCalled();
    now += DERIVED_CACHE_QUOTA_POLICY.refreshIntervalMs;
    expect(sampler.read(0, shared)).toEqual(shared);
    await vi.waitFor(() => expect(sampler.read(0)?.sampledAt).toBe(now));
    now++;
    sampler.invalidate();
    expect(sampler.read(0, shared)).toBeUndefined();
    await Promise.resolve();
    expect(estimate).toHaveBeenCalledTimes(2);
    sampler.close();
  });
  it("treats no API or rejected estimates as a configured fallback", async () => {
    vi.stubGlobal("navigator", {});
    const sampler = createDerivedCacheQuotaSampler();
    sampler.read(0);
    await vi.waitFor(() => expect(sampler.read(0)).toBeDefined());
    expect(resolveDerivedCacheQuotaCapacity(fallback, sampler.read(0)).capacityBytes).toBe(fallback);
    sampler.close();
    const rejected = createDerivedCacheQuotaSampler({ estimate: async () => { throw new Error("unavailable"); } });
    rejected.read(0);
    await vi.waitFor(() => expect(rejected.read(0)).toBeDefined());
    expect(resolveDerivedCacheQuotaCapacity(fallback, rejected.read(0)).capacityBytes).toBe(fallback);
    rejected.close();
  });
  it("times out a hung estimate and ignores its later answer after invalidation", async () => {
    vi.useFakeTimers();
    let resolve!: (value: StorageEstimate) => void;
    const sampler = createDerivedCacheQuotaSampler({
      estimate: () => new Promise<StorageEstimate>(done => { resolve = done; }),
    });
    sampler.read(0);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(DERIVED_CACHE_QUOTA_POLICY.estimateDeadlineMs);
    expect(resolveDerivedCacheQuotaCapacity(fallback, sampler.read(0)).capacityBytes).toBe(fallback);
    sampler.invalidate();
    resolve({ quota: 10 * GIB, usage: 0 });
    await Promise.resolve();
    expect(sampler.read(0)).toBeUndefined();
    sampler.close();
  });
});
