import { isLocalhostHostname } from "@carma-commons/utils";

type CorridorProgress = Readonly<{
  id: string;
  samples: number;
  totalSamples: number;
  published: boolean;
  ready: boolean;
  width: number;
  height: number;
}>;

const STALL_MILLISECONDS = 20_000;
let nextWatchdogId = 0;

/** One timer for the scene, also detects stalls without subsequent repaints. */
export class ShadowCorridorWatchdog {
  readonly enabled = isLocalhostHostname(globalThis.location?.hostname);
  private readonly reportId = ++nextWatchdogId;
  private nextCorridorId = 0;
  private readonly labels = new Map<string, string>();
  private readonly pending = new Map<
    string,
    { progress: CorridorProgress; advancedAt: number; reported: boolean }
  >();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private context: unknown;

  observe(
    pages: readonly CorridorProgress[],
    context: {
      activeId?: string | null;
      memoryBytes?: number;
      fallbackReason?: string | null;
      publicationRetries?: readonly (readonly [
        string,
        {
          attempts: number;
          retryAt: number;
        }
      ])[];
    }
  ) {
    if (!this.enabled) return;
    const now = performance.now();
    for (const { id } of pages) {
      if (!this.labels.has(id)) {
        this.labels.set(id, `C${this.reportId}.${++this.nextCorridorId}`);
      }
    }
    this.context = {
      total: pages.length,
      ready: pages.filter((page) => page.ready).length,
      completed: pages.filter((page) => page.published).length,
      samples: pages.reduce((total, page) => total + page.samples, 0),
      activeId: context.activeId ? this.labels.get(context.activeId) : null,
      memoryBytes: context.memoryBytes,
      fallbackReason: context.fallbackReason,
      publicationRetries: context.publicationRetries?.map(([id, retry]) => ({
        id: this.labels.get(id),
        attempts: retry.attempts,
        retryInMs: Math.max(0, Math.round(retry.retryAt - now)),
      })),
    };
    const ids = new Set(pages.map(({ id }) => id));
    for (const id of this.pending.keys()) {
      if (!ids.has(id)) this.pending.delete(id);
    }
    for (const id of this.labels.keys()) {
      if (!ids.has(id)) this.labels.delete(id);
    }
    for (const progress of pages) {
      if (progress.published) {
        this.pending.delete(progress.id);
        continue;
      }
      const previous = this.pending.get(progress.id);
      const advanced =
        !previous || progress.samples > previous.progress.samples;
      this.pending.set(progress.id, {
        progress,
        advancedAt: advanced ? now : previous.advancedAt,
        reported: advanced ? false : previous.reported,
      });
    }
    this.schedule();
  }

  pause() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pending.clear();
  }

  private schedule() {
    if (this.timer !== undefined) return;
    let next = Infinity;
    for (const entry of this.pending.values()) {
      if (!entry.reported)
        next = Math.min(next, entry.advancedAt + STALL_MILLISECONDS);
    }
    if (!Number.isFinite(next)) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      const now = performance.now();
      const stalled = [];
      for (const entry of this.pending.values()) {
        if (entry.reported || now - entry.advancedAt < STALL_MILLISECONDS)
          continue;
        entry.reported = true;
        stalled.push({
          ...entry.progress,
          id: this.labels.get(entry.progress.id),
          file: entry.progress.id.match(/\/([^/"\\]+\.b3dm)/)?.[1],
          stalledMilliseconds: Math.round(now - entry.advancedAt),
          waitingForReadiness: !entry.progress.ready,
        });
      }
      if (stalled.length > 0) {
        console.warn(
          "[shadow-simulation] corridors without progress for 20 seconds",
          JSON.stringify({ corridors: stalled, scheduler: this.context })
        );
      }
      this.schedule();
    }, Math.max(0, next - performance.now()));
  }
}
