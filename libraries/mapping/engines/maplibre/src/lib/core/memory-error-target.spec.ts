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
