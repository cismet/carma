import { TILES_LOAD_POLICY } from "./tile-load-config";

type MemoryTargetProbe = Readonly<{ target: number; headroomBytes: number }>;
export type MemoryTargetRecovery = Readonly<{
  pending: MemoryTargetProbe | null;
  failed: MemoryTargetProbe | null;
}>;
export const EMPTY_MEMORY_TARGET_RECOVERY: MemoryTargetRecovery = {
  pending: null,
  failed: null,
};

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
  /** All active cuts converged; no queues, motion or failures. */
  settled?: boolean;
  /** Actual loaded scene bytes, excluding queued predictions. */
  residentBytes?: number;
  /** Reported allocation/context failure, distinct from queued reservations. */
  memoryFailure?: boolean;
  /** At least one predicted tile or known replacement-family allocation. */
  minimumProbeBytes?: number;
  recovery?: MemoryTargetRecovery;
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
): {
  target: number;
  changedAt: number;
  retryInMs: number | null;
  recovery: MemoryTargetRecovery;
} => {
  const headroomBytes = Math.max(
    0,
    input.ceilingBytes - Math.max(input.cachedBytes, input.residentBytes ?? 0)
  );
  const requiredHeadroom = Math.max(
    input.ceilingBytes * TILES_LOAD_POLICY.memoryTargetProbeHeadroom,
    input.minimumProbeBytes ?? 0
  );
  const residentPressure =
    input.memoryFailure === true ||
    (input.residentBytes ?? input.cachedBytes) >=
      input.ceilingBytes * (1 - TILES_LOAD_POLICY.memoryTargetProbeHeadroom);
  let recovery = input.recovery ?? EMPTY_MEMORY_TARGET_RECOVERY;
  if (recovery.pending && input.current > recovery.pending.target)
    recovery = {
      pending: null,
      failed: residentPressure ? recovery.pending : recovery.failed,
    };
  else if (
    recovery.pending &&
    input.settled &&
    input.current <= recovery.pending.target &&
    input.now - input.changedAt > TILES_LOAD_POLICY.memoryTargetRelaxAfterMs
  )
    recovery = {
      pending: null,
      failed:
        recovery.failed && input.current > recovery.failed.target
          ? recovery.failed
          : null,
    };
  const since = input.now - input.changedAt;
  const maximum = Number.isFinite(input.maximum)
    ? Math.max(input.base, input.maximum!)
    : input.base;
  const raiseEligible =
    input.cacheFull &&
    residentPressure &&
    !input.viewConverged &&
    input.current < maximum;
  if (raiseEligible && since > TILES_LOAD_POLICY.memoryTargetRaiseAfterMs)
    return {
      target: Math.min(
        maximum,
        input.current * TILES_LOAD_POLICY.memoryTargetStep
      ),
      changedAt: input.now,
      retryInMs: null,
      recovery: recovery.pending
        ? { pending: null, failed: recovery.pending }
        : recovery,
    };
  const nextTarget = Math.max(
    input.requested,
    input.current / TILES_LOAD_POLICY.memoryTargetStep
  );
  const headroomAvailable =
    input.settled === true && headroomBytes >= requiredHeadroom;
  const headroomProbe =
    headroomAvailable && Number.isFinite(input.residentBytes);
  // A cheap cache check may arm the timer. Actual resident/family inspection
  // is required at the deadline before any finer requests are admitted.
  const pendingInspection =
    headroomAvailable && since <= TILES_LOAD_POLICY.memoryTargetRelaxAfterMs;
  // A failed step remembers its pre-request capacity. Cancelling its requests,
  // a pan or a sun change alone must not reissue the same refinement burst.
  const retryHasNewCapacity =
    !recovery.failed ||
    nextTarget > recovery.failed.target ||
    headroomBytes >= recovery.failed.headroomBytes + requiredHeadroom;
  const relaxEligible =
    !input.cacheFull &&
    // Retained, unused entries are reusable, not a quality obligation. Above
    // the normal relaxation watermark, settled resident headroom permits a
    // bounded probe without changing the cache ceiling or published cut.
    (Math.min(input.cachedBytes, input.usedBytes ?? input.cachedBytes) <
      input.ceilingBytes * TILES_LOAD_POLICY.memoryTargetRelaxBelow ||
      headroomProbe ||
      pendingInspection) &&
    retryHasNewCapacity &&
    input.current > input.requested;
  if (relaxEligible && since > TILES_LOAD_POLICY.memoryTargetRelaxAfterMs)
    return {
      target: nextTarget,
      changedAt: input.now,
      retryInMs: null,
      recovery: headroomProbe
        ? {
            pending: { target: nextTarget, headroomBytes },
            failed: recovery.failed,
          }
        : recovery,
    };
  const deadline = raiseEligible
    ? TILES_LOAD_POLICY.memoryTargetRaiseAfterMs
    : relaxEligible || (recovery.pending && input.settled)
    ? TILES_LOAD_POLICY.memoryTargetRelaxAfterMs
    : null;
  return {
    target: input.current,
    changedAt: input.changedAt,
    retryInMs: deadline === null ? null : Math.max(1, deadline - since + 1),
    recovery,
  };
};
