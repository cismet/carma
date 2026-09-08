import type { Group } from "three";
import type {
  ShadowPrewarmPage,
  ShadowPrewarmResult,
} from "./tiled-shadow-renderer";

export type ShadowCasterLease = Readonly<{
  covered: boolean;
  group: Group | null;
  isCurrent: () => boolean;
  dispose: () => void;
}>;

export type ShadowIdlePageStats = Readonly<{
  offered: number;
  completed: number;
  skippedCoverage: number;
  renderedSamples: number;
  budgetLimited: boolean;
  aborted: boolean;
}>;

/** One corridor lease at a time, one depth pass per background task. A cache
 * entry is valid only with complete caster coverage; never fill holes with a
 * guessed flat plane. Native scheduling lets input interrupt between samples.
 * GPU submission itself is synchronous and cannot be pre-empted by a worker.
 */
export const prewarmShadowPages = async ({
  pages,
  signal,
  prepare,
  render,
  yieldToInput,
}: {
  pages: readonly ShadowPrewarmPage[];
  signal: AbortSignal;
  prepare: (
    page: ShadowPrewarmPage,
    signal: AbortSignal
  ) => Promise<ShadowCasterLease>;
  render: (
    pageId: string,
    group: Group | null,
    signal: AbortSignal
  ) => ShadowPrewarmResult;
  yieldToInput: (signal: AbortSignal) => Promise<void>;
}): Promise<ShadowIdlePageStats> => {
  let completed = 0;
  let skippedCoverage = 0;
  let renderedSamples = 0;
  let budgetLimited = false;
  try {
    for (const page of pages) {
      if (signal.aborted) break;
      if (page.cachedSamples >= page.samples) {
        completed += 1;
        continue;
      }
      if (!page.canPrewarm) {
        budgetLimited = true;
        continue;
      }
      await yieldToInput(signal);
      if (signal.aborted) break;
      const lease = await prepare(page, signal);
      try {
        if (signal.aborted) break;
        if (!lease.covered || !lease.isCurrent()) {
          skippedCoverage += 1;
          continue;
        }
        // The finite sample count also bounds a broken renderer that never
        // reports progress. No retries after a failed/stale/budget-limited pass.
        const sampleBudget = Math.min(page.samples, page.sampleBudget);
        if (sampleBudget < page.samples) budgetLimited = true;
        for (let index = page.cachedSamples; index < sampleBudget; index += 1) {
          await yieldToInput(signal);
          if (signal.aborted || !lease.isCurrent()) break;
          const result = render(page.id, lease.group, signal);
          renderedSamples += result.rendered;
          if (result.complete) {
            completed += 1;
            break;
          }
          if (result.budgetLimited) {
            budgetLimited = true;
            break;
          }
          if (result.aborted || !result.rendered) break;
        }
      } finally {
        lease.dispose();
      }
    }
  } catch (error) {
    if (!signal.aborted) throw error;
  }
  return {
    offered: pages.length,
    completed,
    skippedCoverage,
    renderedSamples,
    budgetLimited,
    aborted: signal.aborted,
  };
};
