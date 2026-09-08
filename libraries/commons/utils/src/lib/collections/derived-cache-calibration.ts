import { DERIVED_CACHE_DEFAULTS } from "./derived-cache-policy";

export const DERIVED_CACHE_CALIBRATION_DEFAULTS = {
  minimumSavingRatio: DERIVED_CACHE_DEFAULTS.minimumSavingRatio,
  minSamples: 5,
} as const;

export const DERIVED_CACHE_CALIBRATION_REASON = {
  admitted: "admitted",
  invalidOptions: "invalid-options",
  invalidBaseline: "invalid-baseline",
  invalidObservedReuseCount: "invalid-observed-reuse-count",
  invalidCandidate: "invalid-candidate",
  duplicateId: "duplicate-id",
  insufficientSamples: "insufficient-samples",
  invalidSamples: "invalid-samples",
  parityNotVerified: "parity-not-verified",
  insufficientMedianSaving: "insufficient-median-saving",
  insufficientP95Saving: "insufficient-p95-saving",
  invalidCostCalculation: "invalid-cost-calculation",
  preparationNotAmortized: "preparation-not-amortized",
} as const;

export type DerivedCacheCalibrationReason =
  (typeof DERIVED_CACHE_CALIBRATION_REASON)[keyof typeof DERIVED_CACHE_CALIBRATION_REASON];

export type DerivedCacheCalibrationBaseline = Readonly<{
  samplesMs: readonly number[];
}>;

export type DerivedCacheCalibrationCandidate =
  DerivedCacheCalibrationBaseline &
    Readonly<{
      id: string;
      /** Measured encode, write and startup cost at the same caller boundary. */
      prepareMs: number;
      bytes: number;
      parityVerified: boolean;
    }>;

export interface DerivedCacheCalibrationOptions {
  /** May tighten, but not weaken, the 5% minimum. */
  readonly minimumSavingRatio?: number;
  /** May increase, but not reduce, the five-sample minimum. */
  readonly minSamples?: number;
}

export type DerivedCacheCalibrationSummary = Readonly<{
  sampleCount: number;
  medianMs: number;
  /** Nearest-rank percentile; five samples therefore use their maximum. */
  p95Ms: number;
}>;

export type DerivedCacheCalibrationAudit = Readonly<{
  id: string | null;
  bytes: number | null;
  prepareMs: number | null;
  sampleCount: number;
  medianMs: number | null;
  p95Ms: number | null;
  /** Median saving per reuse, before preparation cost; may be negative. */
  savedMs: number | null;
  /** Observed reuse count times savedMs, minus preparation cost. */
  amortizedSavedMs: number | null;
  /** First whole reuse count with positive savings, or null if unavailable. */
  breakEvenReuses: number | null;
  admitted: boolean;
  admittedReason: DerivedCacheCalibrationReason;
}>;

export type DerivedCacheCalibrationResult = Readonly<{
  baseline: DerivedCacheCalibrationSummary | null;
  candidates: readonly DerivedCacheCalibrationAudit[];
  winnerId: string | null;
}>;

const summarizeSamples = (
  samplesMs: readonly number[] | undefined,
  minSamples: number
): DerivedCacheCalibrationSummary | null => {
  if (!Array.isArray(samplesMs) || samplesMs.length < minSamples) return null;
  for (const sample of samplesMs) {
    if (!Number.isFinite(sample) || sample <= 0) return null;
  }
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const upper = sorted[Math.floor(sorted.length / 2)];
  const lower = sorted[Math.floor((sorted.length - 1) / 2)];
  return {
    sampleCount: sorted.length,
    medianMs: lower + (upper - lower) / 2,
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
  };
};

const getBreakEvenReuses = (savedMs: number, prepareMs: number) => {
  if (!(savedMs > 0) || !Number.isFinite(prepareMs) || prepareMs < 0) return null;
  let count = Math.floor(prepareMs / savedMs) + 1;
  if (!Number.isSafeInteger(count)) return null;
  // Keep the reported boundary consistent with the actual floating-point gate.
  if (count > 1 && (count - 1) * savedMs > prepareMs) count -= 1;
  if (count * savedMs <= prepareMs) count += 1;
  return Number.isSafeInteger(count) ? count : null;
};

/** DBC-02: local measurements select a strategy, never a universal backend.
 * See ./DERIVED_CACHE_DECISIONS.md. The caller owns measurement, scheduling,
 * persistence and matching the source/restore timing boundaries.
 */
export const calibrateDerivedCacheStrategies = (
  baseline: DerivedCacheCalibrationBaseline,
  candidates: readonly DerivedCacheCalibrationCandidate[],
  observedReuseCount: number,
  options: DerivedCacheCalibrationOptions = {}
): DerivedCacheCalibrationResult => {
  const { minimumSavingRatio, minSamples } = {
    ...DERIVED_CACHE_CALIBRATION_DEFAULTS,
    ...options,
  };
  const validOptions =
    Number.isSafeInteger(minSamples) &&
    minSamples >= DERIVED_CACHE_CALIBRATION_DEFAULTS.minSamples &&
    Number.isFinite(minimumSavingRatio) &&
    minimumSavingRatio >=
      DERIVED_CACHE_CALIBRATION_DEFAULTS.minimumSavingRatio &&
    minimumSavingRatio <= 1;
  const requiredSamples = validOptions
    ? minSamples
    : DERIVED_CACHE_CALIBRATION_DEFAULTS.minSamples;
  const baselineSummary = summarizeSamples(baseline?.samplesMs, requiredSamples);
  const validReuseCount =
    Number.isSafeInteger(observedReuseCount) && observedReuseCount >= 1;
  const identifiers = new Map<string, number>();
  for (const candidate of candidates) {
    if (typeof candidate?.id === "string") {
      identifiers.set(candidate.id, (identifiers.get(candidate.id) ?? 0) + 1);
    }
  }
  const audits = candidates.map((candidate): DerivedCacheCalibrationAudit => {
    const summary = summarizeSamples(candidate?.samplesMs, requiredSamples);
    const savedMs =
      summary && baselineSummary
        ? baselineSummary.medianMs - summary.medianMs
        : null;
    const validCandidate =
      typeof candidate?.id === "string" && candidate.id.trim().length > 0 &&
      Number.isSafeInteger(candidate.bytes) && candidate.bytes > 0 &&
      Number.isFinite(candidate.prepareMs) && candidate.prepareMs >= 0 &&
      typeof candidate.parityVerified === "boolean";
    const amortizedSavedMs =
      savedMs !== null && validReuseCount && validCandidate
        ? observedReuseCount * savedMs - candidate.prepareMs
        : null;
    const reason = DERIVED_CACHE_CALIBRATION_REASON;
    let admittedReason: DerivedCacheCalibrationReason = reason.admitted;
    if (!validOptions) admittedReason = reason.invalidOptions;
    else if (!baselineSummary) admittedReason = reason.invalidBaseline;
    else if (!validReuseCount) admittedReason = reason.invalidObservedReuseCount;
    else if (!validCandidate) admittedReason = reason.invalidCandidate;
    else if (identifiers.get(candidate.id)! > 1) admittedReason = reason.duplicateId;
    else if (!Array.isArray(candidate.samplesMs)) admittedReason = reason.invalidSamples;
    else if (candidate.samplesMs.length < requiredSamples)
      admittedReason = reason.insufficientSamples;
    else if (!summary) admittedReason = reason.invalidSamples;
    else if (!candidate.parityVerified) admittedReason = reason.parityNotVerified;
    else if (summary.medianMs > baselineSummary.medianMs * (1 - minimumSavingRatio))
      admittedReason = reason.insufficientMedianSaving;
    else if (summary.p95Ms > baselineSummary.p95Ms * (1 - minimumSavingRatio))
      admittedReason = reason.insufficientP95Saving;
    else if (amortizedSavedMs === null || !Number.isFinite(amortizedSavedMs))
      admittedReason = reason.invalidCostCalculation;
    else if (amortizedSavedMs <= 0) admittedReason = reason.preparationNotAmortized;
    return {
      id: typeof candidate?.id === "string" ? candidate.id : null,
      bytes: Number.isFinite(candidate?.bytes) ? candidate.bytes : null,
      prepareMs: Number.isFinite(candidate?.prepareMs) ? candidate.prepareMs : null,
      sampleCount: Array.isArray(candidate?.samplesMs) ? candidate.samplesMs.length : 0,
      medianMs: summary?.medianMs ?? null,
      p95Ms: summary?.p95Ms ?? null,
      savedMs,
      amortizedSavedMs:
        amortizedSavedMs !== null && Number.isFinite(amortizedSavedMs)
          ? amortizedSavedMs
          : null,
      breakEvenReuses:
        savedMs !== null && validCandidate
          ? getBreakEvenReuses(savedMs, candidate.prepareMs)
          : null,
      admitted: admittedReason === reason.admitted,
      admittedReason,
    };
  });
  const admitted = audits.filter((candidate) => candidate.admitted);
  admitted.sort((a, b) =>
    a.medianMs! - b.medianMs! || a.p95Ms! - b.p95Ms! || a.bytes! - b.bytes! ||
    (a.id! < b.id! ? -1 : a.id! > b.id! ? 1 : 0)
  );
  return { baseline: baselineSummary, candidates: audits, winnerId: admitted[0]?.id ?? null };
};

export type DerivedCacheCalibrationProfile = Readonly<{
  version: string;
  environmentKey: string;
  /** Epoch milliseconds supplied by the caller. */
  measuredAt: number;
}>;

export type DerivedCacheCalibrationProfileValidity = Readonly<{
  version: string;
  environmentKey: string;
  ttlMs: number;
  nowMs: number;
}>;

/** Identity/age check only; this does not authenticate stored measurements. */
export const isDerivedCacheCalibrationProfileValid = (
  profile: DerivedCacheCalibrationProfile | null | undefined,
  expected: DerivedCacheCalibrationProfileValidity
): boolean =>
  !!profile &&
  typeof expected?.version === "string" && expected.version.trim().length > 0 &&
  typeof expected.environmentKey === "string" && expected.environmentKey.trim().length > 0 &&
  profile.version === expected.version && profile.environmentKey === expected.environmentKey &&
  Number.isFinite(expected.nowMs) && expected.nowMs >= 0 &&
  Number.isFinite(expected.ttlMs) && expected.ttlMs >= 0 &&
  Number.isFinite(profile.measuredAt) && profile.measuredAt >= 0 &&
  profile.measuredAt <= expected.nowMs &&
  expected.nowMs - profile.measuredAt <= expected.ttlMs;
