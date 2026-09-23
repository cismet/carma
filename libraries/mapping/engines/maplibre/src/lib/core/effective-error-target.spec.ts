import { describe, expect, it } from "vitest";

import {
  ERROR_TARGET_POLICY,
  createEffectiveErrorTargetState,
  nextEffectiveErrorTarget,
} from "./effective-error-target";
import type {
  EffectiveErrorTargetState,
  ErrorTargetObservation,
} from "./effective-error-target";

const MIB = 1024 ** 2;
const GIB = 1024 ** 3;

describe("nextEffectiveErrorTarget", () => {
  const ceiling = 1 * GIB;
  const baseObservation: ErrorTargetObservation = {
    now: 10_000,
    physicallyFull: true,
    pipelineIdle: true,
    mainConverged: false,
    usedBytesMain: ceiling,
    cachedBytes: ceiling,
    ceiling,
    zoom: 17,
    pitch: 45,
    unusedEvictable: false,
    lastProgressAt: 0,
  };
  const step = (
    state: EffectiveErrorTargetState,
    patch: Partial<ErrorTargetObservation>
  ) => nextEffectiveErrorTarget(state, { ...baseObservation, ...patch });

  it("relaxes once the stall held for the hold time and remembers the failure", () => {
    let state = createEffectiveErrorTargetState(0.25, 10_000);
    let result = step(state, { now: 10_000 });
    expect(result.changed).toBe(false);
    expect(result.retryInMs).toBe(ERROR_TARGET_POLICY.relaxHoldMs);
    state = result.state;

    result = step(state, { now: 10_500 });
    expect(result.changed).toBe(false);
    state = result.state;

    result = step(state, { now: 11_000 });
    expect(result.changed).toBe(true);
    expect(result.state.effective).toBe(0.5);
    expect(result.state.failedTarget).toBe(0.25);
    expect(result.state.failedView).toEqual({ zoom: 17, pitch: 45, ceiling });
    state = result.state;

    // a second stall relaxes again up to the cap of 4x the requested target
    result = step(state, { now: 11_000 });
    expect(result.changed).toBe(false);
    result = step(result.state, { now: 12_000 });
    expect(result.state.effective).toBe(1);
    result = step(result.state, { now: 13_000 });
    expect(result.changed).toBe(false);
    expect(result.state.effective).toBe(1);
  });

  it("restarts the hold on progress but not on its own evictions", () => {
    let state = createEffectiveErrorTargetState(1, 10_000);
    state = step(state, { now: 10_000 }).state;
    // eviction dip: not full, something evictable, still unconverged
    state = step(state, {
      now: 10_400,
      physicallyFull: false,
      unusedEvictable: true,
    }).state;
    let result = step(state, { now: 11_000 });
    expect(result.changed).toBe(true);
    expect(result.state.effective).toBe(2);

    // progress at 11_600 restarts the hold
    state = result.state;
    state = step(state, { now: 11_100 }).state;
    result = step(state, { now: 12_100, lastProgressAt: 11_600 });
    expect(result.changed).toBe(false);
    result = step(result.state, { now: 12_600, lastProgressAt: 11_600 });
    expect(result.changed).toBe(true);
    expect(result.state.effective).toBe(4);
  });

  it("does not relax while something can still be evicted or the pipeline is busy", () => {
    const state = createEffectiveErrorTargetState(1, 10_000);
    let result = step(state, { now: 10_000, unusedEvictable: true });
    result = step(result.state, { now: 12_000, unusedEvictable: true });
    expect(result.changed).toBe(false);
    result = step(result.state, { now: 14_000, pipelineIdle: false });
    expect(result.changed).toBe(false);
    result = step(result.state, { now: 16_000, physicallyFull: false });
    expect(result.changed).toBe(false);
  });

  it("does not re-tighten into the failed target in the same view class", () => {
    let state = createEffectiveErrorTargetState(0.25, 10_000);
    state = step(state, { now: 10_000 }).state;
    state = step(state, { now: 11_000 }).state;
    expect(state.effective).toBe(0.5);

    // converged with plenty of headroom after eviction, cooldown elapsed
    const result = step(state, {
      now: 20_000,
      physicallyFull: false,
      mainConverged: true,
      usedBytesMain: 64 * MIB,
      cachedBytes: 64 * MIB,
    });
    expect(result.changed).toBe(false);
    expect(result.state.effective).toBe(0.5);
    expect(result.retryInMs).toBeNull();
  });

  it("clears the failure memory after a zoom change and tightens stepwise", () => {
    let state = createEffectiveErrorTargetState(0.25, 10_000);
    state = step(state, { now: 10_000 }).state;
    state = step(state, { now: 11_000 }).state;
    state = step(state, { now: 11_000 }).state;
    state = step(state, { now: 12_000 }).state;
    expect(state.effective).toBe(1);

    const zoomedIn = {
      zoom: 17.6,
      physicallyFull: false,
      mainConverged: true,
      usedBytesMain: 64 * MIB,
      cachedBytes: 64 * MIB,
    };
    let result = step(state, { ...zoomedIn, now: 12_500 });
    expect(result.changed).toBe(false);
    expect(result.retryInMs).toBe(1_000);
    result = step(result.state, { ...zoomedIn, now: 13_500 });
    expect(result.changed).toBe(true);
    expect(result.state.effective).toBe(0.5);
    expect(result.state.failedTarget).toBeNull();
    expect(result.state.tightenBaselineBytes).toBe(64 * MIB);

    // converging after the step teaches the growth ratio
    result = step(result.state, {
      ...zoomedIn,
      now: 14_000,
      usedBytesMain: 192 * MIB,
    });
    expect(result.state.tightenBaselineBytes).toBeNull();
    expect(result.state.growthRatio).toBeCloseTo(
      4 + (3 - 4) * ERROR_TARGET_POLICY.growthRatioWeight
    );
    result = step(result.state, {
      ...zoomedIn,
      now: 15_000,
      usedBytesMain: 192 * MIB,
    });
    expect(result.changed).toBe(true);
    expect(result.state.effective).toBe(0.25);
  });

  it("does not tighten without headroom for the predicted growth", () => {
    let state = createEffectiveErrorTargetState(0.25, 10_000);
    state = step(state, { now: 10_000 }).state;
    state = step(state, { now: 11_000 }).state;
    const result = step(state, {
      now: 20_000,
      zoom: 18,
      physicallyFull: false,
      mainConverged: true,
      usedBytesMain: 300 * MIB,
      cachedBytes: 300 * MIB,
    });
    expect(result.changed).toBe(false);
    expect(result.retryInMs).toBeNull();
  });

  it("treats a pan without a zoom or pitch change as the same view class", () => {
    let state = createEffectiveErrorTargetState(0.25, 10_000);
    state = step(state, { now: 10_000 }).state;
    state = step(state, { now: 11_000 }).state;
    const result = step(state, {
      now: 20_000,
      zoom: 17.2,
      pitch: 55,
      physicallyFull: false,
      mainConverged: true,
      usedBytesMain: 64 * MIB,
    });
    expect(result.state.failedTarget).toBe(0.25);
    expect(result.changed).toBe(false);
  });

  it("clears the failure memory when the ceiling grows", () => {
    let state = createEffectiveErrorTargetState(0.25, 10_000);
    state = step(state, { now: 10_000 }).state;
    state = step(state, { now: 11_000 }).state;
    const result = step(state, {
      now: 20_000,
      ceiling: 2 * GIB,
      physicallyFull: false,
      mainConverged: true,
      usedBytesMain: 64 * MIB,
    });
    expect(result.changed).toBe(true);
    expect(result.state.effective).toBe(0.25);
  });

  it("still relaxes a zero requested target", () => {
    let state = createEffectiveErrorTargetState(0, 10_000);
    state = step(state, { now: 10_000 }).state;
    const result = step(state, { now: 11_000 });
    expect(result.changed).toBe(true);
    expect(result.state.effective).toBe(
      2 * ERROR_TARGET_POLICY.minimumRelaxBase
    );
  });
});
