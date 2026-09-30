import { describe, expect, it } from "vitest";

import { TILES_LOAD_POLICY } from "./tile-load-config";
import { nextMemoryErrorTarget } from "./memory-error-target";

describe("nextMemoryErrorTarget", () => {
  const base = { requested: 6, base: 20, cachedBytes: 0, ceilingBytes: 1e9 };

  it("can release a stalled base cut, bounded by current root SSE", () => {
    const input = {
      ...base,
      current: 20,
      maximum: 40,
      cachedBytes: 1e9,
      cacheFull: true,
      viewConverged: false,
      now: 10_000,
      changedAt: 0,
    };
    expect(nextMemoryErrorTarget(input).target).toBe(30);
    expect(nextMemoryErrorTarget({ ...input, current: 35 }).target).toBe(40);
    expect(nextMemoryErrorTarget({ ...input, maximum: Infinity }).target).toBe(
      20
    );
  });

  it("rises at the ceiling with an unconverged view, never above the base error", () => {
    const raised = nextMemoryErrorTarget({
      ...base,
      current: 6,
      cacheFull: true,
      viewConverged: false,
      cachedBytes: 1e9,
      now: 10_000,
      changedAt: 0,
    });
    expect(raised.target).toBe(9);
    expect(raised.changedAt).toBe(10_000);
    const capped = nextMemoryErrorTarget({
      ...base,
      current: 18,
      cacheFull: true,
      viewConverged: false,
      cachedBytes: 1e9,
      now: 20_000,
      changedAt: 0,
    });
    expect(capped.target).toBe(20);
    const tooSoon = nextMemoryErrorTarget({
      ...base,
      current: 6,
      cacheFull: true,
      viewConverged: false,
      cachedBytes: 1e9,
      now: 1_000,
      changedAt: 0,
    });
    expect(tooSoon.target).toBe(6);
    expect(tooSoon.retryInMs).toBe(
      TILES_LOAD_POLICY.memoryTargetRaiseAfterMs - 1_000 + 1
    );
  });

  it("relaxes towards the requested target once memory frees", () => {
    const relaxed = nextMemoryErrorTarget({
      ...base,
      current: 9,
      cacheFull: false,
      viewConverged: true,
      cachedBytes: 1e8,
      now: 30_000,
      changedAt: 0,
    });
    expect(relaxed.target).toBe(6);
    const held = nextMemoryErrorTarget({
      ...base,
      current: 9,
      cacheFull: false,
      viewConverged: true,
      cachedBytes: 9e8,
      now: 30_000,
      changedAt: 0,
    });
    expect(held.target).toBe(9);
    expect(held.retryInMs).toBeNull();
  });

  it("schedules only the remaining strict relaxation deadline", () => {
    const pending = nextMemoryErrorTarget({
      ...base,
      current: 9,
      cacheFull: false,
      viewConverged: true,
      cachedBytes: 1e8,
      now: 5_999,
      changedAt: 0,
    });
    expect(pending.target).toBe(9);
    expect(pending.retryInMs).toBe(2);
    const noLongerEligible = nextMemoryErrorTarget({
      ...base,
      current: 6,
      cacheFull: false,
      viewConverged: true,
      cachedBytes: 1e8,
      now: 5_999,
      changedAt: 0,
    });
    expect(noLongerEligible.retryInMs).toBeNull();
  });

  it("uses settled resident headroom above the normal watermark, after its existing deadline", () => {
    const input = {
      ...base,
      current: 30.375,
      maximum: 100,
      cacheFull: false,
      viewConverged: true,
      cachedBytes: 8.3e8,
      residentBytes: 8.3e8,
      settled: true,
      minimumProbeBytes: 5e7,
      now: 5_999,
      changedAt: 0,
    };
    expect(nextMemoryErrorTarget(input).retryInMs).toBe(2);
    expect(nextMemoryErrorTarget({ ...input, now: 6_001 }).target).toBe(20.25);
    for (const condition of [
      { settled: false },
      { residentBytes: undefined },
      { minimumProbeBytes: 2e8 },
      { cacheFull: true },
    ])
      expect(
        nextMemoryErrorTarget({ ...input, ...condition, now: 10_000 }).target
      ).toBe(input.current);
  });

  it("recovers successful settled steps to requested quality without raising the grant", () => {
    let input = {
      ...base,
      current: 30.375,
      cacheFull: false,
      viewConverged: true,
      cachedBytes: 8.3e8,
      residentBytes: 8.3e8,
      settled: true,
      now: 10_000,
      changedAt: 0,
      recovery: undefined as Parameters<
        typeof nextMemoryErrorTarget
      >[0]["recovery"],
    };
    for (const target of [20.25, 13.5, 9, 6]) {
      const result = nextMemoryErrorTarget(input);
      expect(result.target).toBe(target);
      input = {
        ...input,
        current: result.target,
        changedAt: result.changedAt,
        recovery: result.recovery,
        now: input.now + 6_001,
      };
    }
    const completed = nextMemoryErrorTarget(input);
    expect(completed.target).toBe(6);
    expect(completed.recovery.pending).toBeNull();
    expect(completed.retryInMs).toBeNull();
  });

  it("lets a prediction-full queue drain without failing a low-residency quality probe", () => {
    const gib = 1024 ** 3;
    const input = {
      ...base,
      current: 9,
      cacheFull: false,
      viewConverged: true,
      cachedBytes: 1.3 * gib,
      residentBytes: 1.3 * gib,
      ceilingBytes: 6 * gib,
      settled: true,
      now: 16_000,
      changedAt: 0,
    };
    const probe = nextMemoryErrorTarget(input);
    expect(probe.target).toBe(6);
    const queued = nextMemoryErrorTarget({
      ...input,
      current: probe.target,
      changedAt: probe.changedAt,
      recovery: probe.recovery,
      cachedBytes: 6.006 * gib,
      now: 18_229,
      cacheFull: true,
      settled: false,
      viewConverged: false,
    });
    expect(queued.target).toBe(6);
    expect(queued.recovery.failed).toBeNull();
    expect(queued.retryInMs).toBeNull();
    const drained = nextMemoryErrorTarget({
      ...input,
      current: queued.target,
      recovery: queued.recovery,
      changedAt: probe.changedAt,
      cachedBytes: 1.628 * gib,
      residentBytes: 1.628 * gib,
      now: 30_000,
    });
    expect(drained.target).toBe(6);
    expect(drained.recovery.pending).toBeNull();
    expect(drained.recovery.failed).toBeNull();
    expect(
      nextMemoryErrorTarget({
        ...input,
        current: 6,
        cacheFull: true,
        viewConverged: false,
        residentBytes: 5.8 * gib,
        cachedBytes: 6.006 * gib,
      }).target
    ).toBe(9);
  });

  it("does not repeat a failed target until additional resident headroom is available", () => {
    const input = {
      ...base,
      current: 30.375,
      maximum: 100,
      cacheFull: false,
      viewConverged: true,
      cachedBytes: 8.3e8,
      residentBytes: 8.3e8,
      settled: true,
      now: 10_000,
      changedAt: 0,
    };
    const probe = nextMemoryErrorTarget(input);
    const failed = nextMemoryErrorTarget({
      ...input,
      current: probe.target,
      recovery: probe.recovery,
      changedAt: probe.changedAt,
      now: 12_001,
      cacheFull: true,
      viewConverged: false,
      settled: false,
      cachedBytes: 1e9,
      residentBytes: 9.5e8,
    });
    expect(failed.target).toBe(30.375);
    const unchangedCapacity = {
      ...input,
      recovery: failed.recovery,
      changedAt: failed.changedAt,
      now: 30_000,
    };
    for (const now of [30_000, 60_000, 90_000]) {
      const unchanged = nextMemoryErrorTarget({ ...unchangedCapacity, now });
      expect(unchanged.target).toBe(30.375);
      expect(unchanged.retryInMs).toBeNull();
    }
    expect(
      nextMemoryErrorTarget({
        ...unchangedCapacity,
        cachedBytes: 7.2e8,
        residentBytes: 7.2e8,
      }).target
    ).toBe(20.25);
  });

  it("does not let unused LRU retention permanently prevent quality recovery", () => {
    const input = {
      ...base,
      current: 9,
      cacheFull: false,
      viewConverged: true,
      cachedBytes: 7.5e8,
      usedBytes: 5.5e8,
      now: 30_000,
      changedAt: 0,
    };
    expect(nextMemoryErrorTarget(input).target).toBe(6);
    expect(nextMemoryErrorTarget({ ...input, usedBytes: 7e8 }).target).toBe(9);
    expect(nextMemoryErrorTarget({ ...input, cacheFull: true }).target).toBe(9);
    expect(
      nextMemoryErrorTarget({ ...input, usedBytes: undefined }).target
    ).toBe(9);
  });
});
