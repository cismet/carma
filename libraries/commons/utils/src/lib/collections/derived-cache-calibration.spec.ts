import { describe, expect, it } from "vitest";

import {
  calibrateDerivedCacheStrategies,
  DERIVED_CACHE_CALIBRATION_REASON,
  isDerivedCacheCalibrationProfileValid,
} from "./derived-cache-calibration";
import type {
  DerivedCacheCalibrationBaseline,
  DerivedCacheCalibrationCandidate,
  DerivedCacheCalibrationOptions,
  DerivedCacheCalibrationProfile,
} from "./derived-cache-calibration";

const samples = (value: number) => [value, value, value, value, value];
const baseline = { samplesMs: samples(100) };
const candidate = (
  id = "raw",
  overrides: Partial<DerivedCacheCalibrationCandidate> = {}
): DerivedCacheCalibrationCandidate => ({
  id,
  samplesMs: samples(90),
  prepareMs: 0,
  bytes: 100,
  parityVerified: true,
  ...overrides,
});
const reason = DERIVED_CACHE_CALIBRATION_REASON;

describe("derived cache client calibration", () => {
  it("admits the exact 5% median and p95 threshold and exposes its cost audit", () => {
    const result = calibrateDerivedCacheStrategies(
      baseline, [candidate("raw", { samplesMs: samples(95), prepareMs: 4 })], 1
    );
    expect(result.baseline).toEqual({ sampleCount: 5, medianMs: 100, p95Ms: 100 });
    expect(result.winnerId).toBe("raw");
    expect(result.candidates[0]).toEqual({
      id: "raw", bytes: 100, prepareMs: 4, sampleCount: 5,
      medianMs: 95, p95Ms: 95, savedMs: 5, amortizedSavedMs: 1,
      breakEvenReuses: 1, admitted: true, admittedReason: reason.admitted,
    });
  });

  it("rejects noise-sized median improvements", () => {
    const result = calibrateDerivedCacheStrategies(
      baseline, [candidate("raw", { samplesMs: samples(95.000001) })], 100
    );
    expect(result.winnerId).toBeNull();
    expect(result.candidates[0].admittedReason).toBe(reason.insufficientMedianSaving);
  });

  it("rejects a faster median when the measured p95 misses the same threshold", () => {
    const result = calibrateDerivedCacheStrategies(
      baseline, [candidate("raw", { samplesMs: [80, 80, 80, 80, 96] })], 100
    );
    expect(result.winnerId).toBeNull();
    expect(result.candidates[0]).toMatchObject({
      medianMs: 80, p95Ms: 96, admittedReason: reason.insufficientP95Saving,
    });
  });

  it("uses an even-sample median and nearest-rank p95 without mutating inputs", () => {
    const source = Object.freeze([100, 103, 99, 100, 101, 98]);
    const timings = Object.freeze([90, 94, 89, 92, 91, 88]);
    const input = Object.freeze([candidate("raw", { samplesMs: timings })]);
    const result = calibrateDerivedCacheStrategies({ samplesMs: source }, input, 1);
    expect(result.baseline).toEqual({ sampleCount: 6, medianMs: 100, p95Ms: 103 });
    expect(result.candidates[0]).toMatchObject({ medianMs: 90.5, p95Ms: 94 });
    expect(timings).toEqual([90, 94, 89, 92, 91, 88]);
    expect(source).toEqual([100, 103, 99, 100, 101, 98]);
  });

  it("uses the 19th sorted observation for p95 with twenty samples", () => {
    const result = calibrateDerivedCacheStrategies(
      { samplesMs: Array(20).fill(100) },
      [candidate("raw", { samplesMs: [...Array(19).fill(90), 110] })], 1
    );
    expect(result.candidates[0].p95Ms).toBe(90);
    expect(result.winnerId).toBe("raw");
  });

  it("requires positive amortized savings at the observed, not predicted, reuse count", () => {
    const candidates = [candidate("encoded", { prepareMs: 30 })];
    for (const reuse of [1, 3]) {
      const result = calibrateDerivedCacheStrategies(baseline, candidates, reuse);
      expect(result.winnerId).toBeNull();
      expect(result.candidates[0]).toMatchObject({
        breakEvenReuses: 4, admittedReason: reason.preparationNotAmortized,
      });
    }
    const result = calibrateDerivedCacheStrategies(baseline, candidates, 4);
    expect(result.winnerId).toBe("encoded");
    expect(result.candidates[0].amortizedSavedMs).toBe(10);
  });

  it("does not grant a win to unchanged or slower strategies", () => {
    const result = calibrateDerivedCacheStrategies(baseline, [
      candidate("same", { samplesMs: samples(100) }),
      candidate("slower", { samplesMs: samples(110) }),
    ], 100);
    expect(result.winnerId).toBeNull();
    expect(result.candidates.map((audit) => audit.savedMs)).toEqual([0, -10]);
    expect(result.candidates.map((audit) => audit.breakEvenReuses)).toEqual([null, null]);
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, undefined, null])(
    "rejects invalid or unknown observed reuse count %s", (reuse) => {
      const result = calibrateDerivedCacheStrategies(baseline, [candidate()], reuse as number);
      expect(result.winnerId).toBeNull();
      expect(result.candidates[0].admittedReason).toBe(reason.invalidObservedReuseCount);
      expect(result.candidates[0].amortizedSavedMs).toBeNull();
    }
  );

  it.each([0, -1, NaN, Infinity])("rejects invalid candidate timing %s", (value) => {
    const result = calibrateDerivedCacheStrategies(
      baseline, [candidate("bad", { samplesMs: [90, 90, 90, 90, value] })], 1
    );
    expect(result.winnerId).toBeNull();
    expect(result.candidates[0].admittedReason).toBe(reason.invalidSamples);
  });

  it.each([
    { samplesMs: samples(0) }, { samplesMs: [100, 100, 100, 100] },
    { samplesMs: [100, 100, 100, 100, NaN] }, null, {},
  ])("fails closed for an invalid baseline %j", (source) => {
    const result = calibrateDerivedCacheStrategies(
      source as DerivedCacheCalibrationBaseline, [candidate()], 1
    );
    expect(result.baseline).toBeNull();
    expect(result.winnerId).toBeNull();
    expect(result.candidates[0].admittedReason).toBe(reason.invalidBaseline);
  });

  it("requires five complete samples and rejects sparse or malformed sample arrays", () => {
    const sparse = samples(90);
    delete sparse[2];
    const result = calibrateDerivedCacheStrategies(baseline, [
      candidate("few", { samplesMs: [90, 90, 90, 90] }),
      candidate("sparse", { samplesMs: sparse }),
      candidate("missing", { samplesMs: undefined as unknown as number[] }),
    ], 1);
    expect(result.winnerId).toBeNull();
    expect(result.candidates.map((audit) => audit.admittedReason)).toEqual([
      reason.insufficientSamples, reason.invalidSamples, reason.invalidSamples,
    ]);
  });

  it.each([
    { id: " " }, { bytes: 0 }, { bytes: 1.5 }, { bytes: NaN },
    { prepareMs: -1 }, { prepareMs: Infinity },
    { parityVerified: "yes" }, null, undefined,
  ])("fails closed for malformed candidate fields %j", (fields) => {
    const value = fields == null ? fields : candidate("bad", fields as Partial<DerivedCacheCalibrationCandidate>);
    const result = calibrateDerivedCacheStrategies(
      baseline, [value as DerivedCacheCalibrationCandidate], 1
    );
    expect(result.winnerId).toBeNull();
    expect(result.candidates[0].admittedReason).toBe(reason.invalidCandidate);
  });

  it("requires verified parity even when the timings would win", () => {
    const result = calibrateDerivedCacheStrategies(
      baseline, [candidate("lossy", { parityVerified: false })], 1
    );
    expect(result.winnerId).toBeNull();
    expect(result.candidates[0].admittedReason).toBe(reason.parityNotVerified);
  });

  it("rejects duplicate identities instead of picking an ambiguous winner", () => {
    const result = calibrateDerivedCacheStrategies(baseline, [candidate(), candidate()], 1);
    expect(result.winnerId).toBeNull();
    expect(result.candidates.every((audit) => audit.admittedReason === reason.duplicateId)).toBe(true);
  });

  it("ranks admitted candidates by median, p95, bytes, then locale-independent id", () => {
    const candidates = [
      candidate("slower-median", { samplesMs: samples(91), bytes: 1 }),
      candidate("slower-tail", { samplesMs: [90, 90, 90, 90, 94], bytes: 1 }),
      candidate("more-bytes", { bytes: 101 }),
      candidate("z"), candidate("a"),
    ];
    expect(calibrateDerivedCacheStrategies(baseline, candidates, 1).winnerId).toBe("a");
    expect(calibrateDerivedCacheStrategies(baseline, [...candidates].reverse(), 1).winnerId).toBe("a");
  });

  it("prioritizes median over a better tail or smaller record", () => {
    const result = calibrateDerivedCacheStrategies(baseline, [
      candidate("median", { samplesMs: [90, 90, 90, 90, 95], bytes: 1000 }),
      candidate("tail", { samplesMs: samples(91), bytes: 1 }),
    ], 1);
    expect(result.winnerId).toBe("median");
  });

  it("prioritizes p95 over bytes and bytes over alphabetical identity", () => {
    const result = calibrateDerivedCacheStrategies(baseline, [
      candidate("a", { samplesMs: [90, 90, 90, 90, 95], bytes: 1 }),
      candidate("b", { bytes: 1001 }),
      candidate("z", { bytes: 1000 }),
    ], 1);
    expect(result.winnerId).toBe("z");
  });

  it.each([
    { minSamples: 4 }, { minSamples: 5.5 }, { minSamples: NaN },
    { minimumSavingRatio: 0.049 }, { minimumSavingRatio: NaN },
    { minimumSavingRatio: 1.01 },
  ])("rejects invalid or weaker policy options %j", (options) => {
    const result = calibrateDerivedCacheStrategies(
      baseline, [candidate()], 1, options as DerivedCacheCalibrationOptions
    );
    expect(result.winnerId).toBeNull();
    expect(result.candidates[0].admittedReason).toBe(reason.invalidOptions);
  });

  it("permits a stricter sample count and savings threshold", () => {
    const result = calibrateDerivedCacheStrategies(
      { samplesMs: Array(6).fill(100) },
      [candidate("raw", { samplesMs: Array(6).fill(80) })],
      1, { minSamples: 6, minimumSavingRatio: 0.2 }
    );
    expect(result.winnerId).toBe("raw");
  });

  it("rejects overflow instead of claiming infinite amortized savings", () => {
    const result = calibrateDerivedCacheStrategies(
      { samplesMs: samples(Number.MAX_VALUE) },
      [candidate("raw", { samplesMs: samples(Number.MAX_VALUE / 2) })], 3
    );
    expect(result.winnerId).toBeNull();
    expect(result.candidates[0].admittedReason).toBe(reason.invalidCostCalculation);
    expect(result.candidates[0].amortizedSavedMs).toBeNull();
  });

  it("returns no winner for an empty candidate list", () => {
    expect(calibrateDerivedCacheStrategies(baseline, [], 1)).toMatchObject({
      winnerId: null, candidates: [],
    });
  });
});

describe("derived cache calibration profile identity and age", () => {
  const profile = { version: "v1", environmentKey: "client-a", measuredAt: 1000 };
  const expected = { version: "v1", environmentKey: "client-a", nowMs: 2000, ttlMs: 1000 };

  it("accepts matching measurements at the inclusive TTL boundary", () => {
    expect(isDerivedCacheCalibrationProfileValid(profile, expected)).toBe(true);
  });

  it.each([
    { version: "v2" }, { environmentKey: "client-b" }, { measuredAt: 999 },
    { measuredAt: 2001 }, { measuredAt: NaN }, { measuredAt: -1 },
  ])("rejects incompatible, stale or future profiles %j", (changes) => {
    expect(isDerivedCacheCalibrationProfileValid({ ...profile, ...changes }, expected)).toBe(false);
  });

  it.each([null, undefined, {}])("rejects absent or malformed profiles %j", (value) => {
    expect(isDerivedCacheCalibrationProfileValid(value as DerivedCacheCalibrationProfile, expected)).toBe(false);
  });

  it.each([
    { ttlMs: -1 }, { ttlMs: NaN }, { nowMs: Infinity }, { nowMs: -1 },
    { version: "" }, { environmentKey: " " },
  ])("rejects invalid validity inputs %j", (changes) => {
    expect(isDerivedCacheCalibrationProfileValid(profile, { ...expected, ...changes })).toBe(false);
  });
});
