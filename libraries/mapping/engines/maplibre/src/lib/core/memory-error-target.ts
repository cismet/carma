import { TILES_LOAD_POLICY } from "./tile-load-config";

export type MemoryErrorTargetInput = Readonly<{
  current: number;
  requested: number;
  /** Default coarsening limit when no current root SSE is available. */
  base: number;
  /** Current root SSE permits a coarser emergency cut in constrained caches. */
  maximum?: number;
  cacheFull: boolean;
  viewConverged: boolean;
  cachedBytes: number;
  /** Pinned/current demand bytes, only supplied for a settled, idle cut. */
  usedBytes?: number;
  ceilingBytes: number;
  now: number;
  changedAt: number;
}>;

/**
 * Memory-adaptive error target (TILES_COVERAGE.md, memory guarantee): at the
 * admission ceiling with an unconverged view the target rises by
 * memoryTargetStep after memoryTargetRaiseAfterMs, up to the current root
 * error (or the base if unspecified); below memoryTargetRelaxBelow it steps towards
 * the requested target after memoryTargetRelaxAfterMs.
 */
export const nextMemoryErrorTarget = (
  input: MemoryErrorTargetInput
): { target: number; changedAt: number; retryInMs: number | null } => {
  const since = input.now - input.changedAt;
  const maximum = Number.isFinite(input.maximum)
    ? Math.max(input.base, input.maximum!)
    : input.base;
  const raiseEligible =
    input.cacheFull && !input.viewConverged && input.current < maximum;
  if (raiseEligible && since > TILES_LOAD_POLICY.memoryTargetRaiseAfterMs)
    return {
      target: Math.min(
        maximum,
        input.current * TILES_LOAD_POLICY.memoryTargetStep
      ),
      changedAt: input.now,
      retryInMs: null,
    };
  const relaxEligible =
    !input.cacheFull &&
    // Retained, unused cache entries are reusable, not a quality obligation.
    // Counting them here deadlocks recovery: LRU retention is 75%, but quality
    // recovery requires less than 60%. Admission still uses physical bytes.
    Math.min(input.cachedBytes, input.usedBytes ?? input.cachedBytes) <
      input.ceilingBytes * TILES_LOAD_POLICY.memoryTargetRelaxBelow &&
    input.current > input.requested;
  if (relaxEligible && since > TILES_LOAD_POLICY.memoryTargetRelaxAfterMs)
    return {
      target: Math.max(
        input.requested,
        input.current / TILES_LOAD_POLICY.memoryTargetStep
      ),
      changedAt: input.now,
      retryInMs: null,
    };
  const deadline = raiseEligible
    ? TILES_LOAD_POLICY.memoryTargetRaiseAfterMs
    : relaxEligible
    ? TILES_LOAD_POLICY.memoryTargetRelaxAfterMs
    : null;
  return {
    target: input.current,
    changedAt: input.changedAt,
    retryInMs: deadline === null ? null : Math.max(1, deadline - since + 1),
  };
};
