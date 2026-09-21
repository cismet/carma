import type { MappingConfig } from "@carma-api";
import type { TransitionStep } from "@carma-mapping/show-remote";

/**
 * Writing to the display through the relay. Every write is the whole state, so
 * only the newest one matters: while a request is out, a newer state replaces
 * whatever was waiting behind it, and a slider dragged across the phone costs
 * one request per round trip rather than one per pixel. Order is kept, which a
 * plain throttle with parallel requests would not guarantee.
 */
export type LatestWinsWriter = {
  /**
   * Resolves once this state, or a newer one that replaced it before it went
   * out, has been written; rejects with the error of that write.
   */
  write: (state: unknown) => Promise<void>;
};

type Waiter = { resolve: () => void; reject: (error: unknown) => void };

export const createLatestWinsWriter = (
  send: (state: unknown) => Promise<void>
): LatestWinsWriter => {
  let isSending = false;
  let pending: { state: unknown; waiters: Waiter[] } | null = null;

  const pump = () => {
    if (isSending || !pending) {
      return;
    }
    const { state, waiters } = pending;
    pending = null;
    isSending = true;
    send(state)
      .then(
        () => {
          waiters.forEach((waiter) => waiter.resolve());
        },
        (error: unknown) => {
          waiters.forEach((waiter) => waiter.reject(error));
        }
      )
      .finally(() => {
        isSending = false;
        pump();
      });
  };

  return {
    write: (state) =>
      new Promise<void>((resolve, reject) => {
        pending = {
          state,
          waiters: [...(pending?.waiters ?? []), { resolve, reject }],
        };
        pump();
      }),
  };
};

export type StepRunResult = "done" | "cancelled";

/**
 * Write the steps of a scene change one after the other, holding after each
 * as the plan says. A newer scene tap cancels by flipping `isCancelled`; the
 * run then stops before its next write, so it never overwrites what the newer
 * one sent. A failed write rejects and ends the run.
 */
export const runSteps = async (
  steps: readonly TransitionStep[],
  {
    apply,
    sleep,
    isCancelled,
  }: {
    apply: (config: MappingConfig) => Promise<void>;
    sleep: (ms: number) => Promise<void>;
    isCancelled: () => boolean;
  }
): Promise<StepRunResult> => {
  for (const step of steps) {
    if (isCancelled()) {
      return "cancelled";
    }
    await apply(step.config);
    if (step.holdMs > 0) {
      await sleep(step.holdMs);
    }
  }
  return isCancelled() ? "cancelled" : "done";
};

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
