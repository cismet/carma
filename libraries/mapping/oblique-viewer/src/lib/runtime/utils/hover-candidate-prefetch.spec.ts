import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DevicePixels } from "@carma-units";
import type { ImagePyramidSource } from "@carma-commons/image-pyramid";

const state = vi.hoisted(() => ({
  instances: [] as any[],
  events: [] as string[],
  plans: new Map<string, any>(),
}));
vi.mock("@carma-commons/image-pyramid", () => {
  class Source {
    priority = "high";
    prefetchBudget?: { remainingBytes: number };
    resident = new Set<number>();
    dispose = vi.fn();
    pause = vi.fn();
    constructor(
      readonly url: string,
      readonly options?: unknown,
      readonly jpegLevels?: number[]
    ) {
      state.instances.push(this);
    }
    charge(bytes: number) {
      if (this.prefetchBudget && bytes > this.prefetchBudget.remainingBytes)
        throw new Error("budget exhausted");
      if (this.prefetchBudget) this.prefetchBudget.remainingBytes -= bytes;
    }
    async open(signal: AbortSignal) {
      const plan = state.plans.get(this.url) ?? {};
      this.charge(plan.metadata ?? 16_384);
      state.events.push(`open:${this.url}`);
      if (plan.open) await plan.open(signal);
      return {
        levels: (plan.levels ?? this.jpegLevels ?? [6, 5]).map(
          (level: number) => ({
            level,
            width: 32,
            height: 16,
            tileWidth: 32,
            tileHeight: 16,
            cols: 1,
            rows: 1,
          })
        ),
      };
    }
    async fetch(
      tiles: { level: number }[],
      signal: AbortSignal,
      priority: string
    ) {
      const plan = state.plans.get(this.url) ?? {};
      const level = tiles[0].level;
      this.charge(plan.costs?.[level] ?? 40_000);
      state.events.push(`fetch:${this.url}:${level}:${priority}`);
      if (plan.fetch) await plan.fetch(level, signal);
      this.resident.add(level);
    }
    hasBytes(tile: { level: number }) {
      return this.resident.has(tile.level);
    }
    async decode(tile: { level: number }, signal: AbortSignal) {
      state.events.push(`decode:${this.url}:${tile.level}`);
      const plan = state.plans.get(this.url) ?? {};
      if (plan.decode) await plan.decode(signal);
      return { close: vi.fn() };
    }
  }
  return { AvifTileSource: Source, JpegTileSource: Source };
});
import { createHoverCandidatePrefetch } from "./hover-candidate-prefetch";

let sequence = 0;
const source = (kind: "avif" | "jpeg" = "avif"): ImagePyramidSource => ({
  id: `image-${++sequence}`,
  url: `https://images.test/candidate-${sequence}.${kind}`,
  kind,
  nativeSize: { width: 2048 as DevicePixels, height: 1024 as DevicePixels },
});
const queues: ReturnType<typeof createHoverCandidatePrefetch>[] = [];
const queue = () => {
  const value = createHoverCandidatePrefetch();
  queues.push(value);
  return value;
};
const flush = () => vi.runAllTimersAsync();
beforeEach(() => {
  vi.useFakeTimers();
  state.instances.length = 0;
  state.events.length = 0;
  state.plans.clear();
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      context = { drawImage: vi.fn() };
      constructor(public width: number, public height: number) {}
      getContext() {
        return this.context;
      }
    }
  );
});
afterEach(() => {
  queues.splice(0).forEach((value) => value.dispose());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("visible footprint candidate prefetch", () => {
  it("finishes every L5 before L4 and every L4 before L3, never fetching L2–L0", async () => {
    const a = source(),
      b = source(),
      value = queue();
    state.plans.set(a.url, { levels: [6, 5, 4, 3, 2, 1, 0] });
    state.plans.set(b.url, { levels: [6, 5, 4, 3, 2, 1, 0] });
    value.update([a, b], false);
    await flush();
    expect(state.events.filter((event) => event.startsWith("fetch:"))).toEqual([
      `fetch:${a.url}:5:low`,
      `fetch:${b.url}:5:low`,
      `fetch:${a.url}:4:low`,
      `fetch:${b.url}:4:low`,
      `fetch:${a.url}:3:low`,
      `fetch:${b.url}:3:low`,
    ]);
    expect(
      state.instances.every((instance) => instance.priority === "low")
    ).toBe(true);
    expect(state.instances.map((instance) => instance.options)).toEqual([
      { maxCompressedBytes: 500000, allowedLevels: [3, 4, 5, 6] },
      { maxCompressedBytes: 500000, allowedLevels: [3, 4, 5, 6] },
    ]);
  });
  it("includes metadata in the decimal 500000-byte allowance and preserves the base when refinement exceeds it", async () => {
    const a = source();
    state.plans.set(a.url, { levels: [6, 5, 4], costs: { 5: 483_616, 4: 1 } });
    const value = queue();
    value.update([a], false);
    await flush();
    expect(state.instances[0].prefetchBudget.remainingBytes).toBe(0);
    expect(state.events.filter((event) => event.startsWith("fetch:"))).toEqual([
      `fetch:${a.url}:5:low`,
    ]);
    expect(await value.readBase(a, new AbortController().signal)).toMatchObject(
      { width: 32, height: 16 }
    );
  });
  it("rejects even one extra requested byte before a payload dispatch", async () => {
    const a = source();
    state.plans.set(a.url, { costs: { 5: 483_617, 6: 483_617 } });
    const value = queue();
    value.update([a], false);
    await flush();
    expect(state.events.filter((event) => event.startsWith("fetch:"))).toEqual(
      []
    );
    expect(state.instances[0].dispose).toHaveBeenCalled();
    expect(
      await value.readBase(a, new AbortController().signal)
    ).toBeUndefined();
  });
  it("deduplicates repeated URL candidates and does not replenish a completed allowance on reentry or a new queue", async () => {
    const a = source(),
      value = queue();
    state.plans.set(a.url, { costs: { 5: 483_616 } });
    value.update([a, { ...a, id: "duplicate" }], false);
    await flush();
    value.update([], false);
    value.update([a], false);
    await flush();
    value.dispose();
    const next = queue();
    next.update([a], false);
    await flush();
    expect(state.instances).toHaveLength(1);
    expect(
      state.events.filter((event) => event.startsWith("fetch:"))
    ).toHaveLength(1);
  });
  it("uses only declared JPEG L3–L6 and rejects families outside that range", async () => {
    const a = source("jpeg"),
      missing = { ...source("jpeg"), jpegLevels: [0, 1, 2] };
    const value = queue();
    value.update([a, missing], false);
    await flush();
    expect(state.instances).toHaveLength(1);
    expect(state.instances[0].jpegLevels).toEqual([6, 5, 4, 3]);
    expect(state.events.filter((event) => event.startsWith("fetch:"))).toEqual([
      `fetch:${a.url}:5:low`,
      `fetch:${a.url}:4:low`,
      `fetch:${a.url}:3:low`,
    ]);
  });
  it("accepts a finer available level when L6 is absent but never a coarser L7", async () => {
    const a = source(),
      b = source();
    state.plans.set(a.url, { levels: [4] });
    state.plans.set(b.url, { levels: [7] });
    const value = queue();
    value.update([a, b], false);
    await flush();
    expect(state.events.filter((event) => event.startsWith("fetch:"))).toEqual([
      `fetch:${a.url}:4:low`,
    ]);
  });
  it("decodes the finest complete resident level, falling back past an incomplete finer one without fetching", async () => {
    const a = source(),
      value = queue();
    state.plans.set(a.url, { levels: [6, 5, 4, 3, 2, 1, 0] });
    value.update([a], false);
    await flush();
    const before = state.events.filter((event) => !event.startsWith("decode:"));
    await value.readBase(a, new AbortController().signal);
    expect(state.events.at(-1)).toBe(`decode:${a.url}:3`);
    state.instances[0].resident.delete(3);
    await value.readBase(a, new AbortController().signal);
    expect(state.events.at(-1)).toBe(`decode:${a.url}:4`);
    expect(
      state.events.filter((event) => !event.startsWith("decode:"))
    ).toEqual(before);
  });
  it("restores a disposed completed source using the remaining allowance without replenishing it", async () => {
    const a = source(),
      value = queue();
    state.plans.set(a.url, { levels: [5, 4, 3] });
    value.update([a], false);
    await flush();
    const allowance = state.instances[0].prefetchBudget;
    const remaining = allowance.remainingBytes;
    value.dispose();
    const replacement = queue();
    replacement.update([a], false);
    await flush();
    expect(state.instances).toHaveLength(2);
    expect(state.instances[1].prefetchBudget).toBe(allowance);
    expect(allowance.remainingBytes).toBe(remaining - 16_384 - 3 * 40_000);
    expect(
      await replacement.readBase(a, new AbortController().signal)
    ).toBeDefined();
  });
  it("restores evicted candidates on reentry without resetting their byte allowance", async () => {
    const sources = Array.from({ length: 129 }, () => source());
    for (const item of sources) state.plans.set(item.url, { levels: [6] });
    const value = queue();
    value.update(sources, false);
    await flush();
    const original = state.instances[0];
    expect(original.dispose).toHaveBeenCalled();
    const remaining = original.prefetchBudget.remainingBytes;
    value.update([], false);
    value.update([sources[0]], false);
    await flush();
    const restored = state.instances
      .filter((item) => item.url === sources[0].url)
      .at(-1);
    expect(restored).not.toBe(original);
    expect(restored.prefetchBudget).toBe(original.prefetchBudget);
    expect(restored.prefetchBudget.remainingBytes).toBeLessThan(remaining);
    expect(
      await value.readBase(sources[0], new AbortController().signal)
    ).toBeDefined();
  });
  it("uses L6 once when L5 is absent, then continues the L4/L3 rounds", async () => {
    const a = source(),
      value = queue();
    state.plans.set(a.url, { levels: [6, 4, 3] });
    value.update([a], false);
    await flush();
    expect(state.events.filter((event) => event.startsWith("fetch:"))).toEqual([
      `fetch:${a.url}:6:low`,
      `fetch:${a.url}:4:low`,
      `fetch:${a.url}:3:low`,
    ]);
  });
  it("falls back once to L6 when L5 exceeds the remaining budget, without replenishment or finer retries", async () => {
    const a = source(),
      value = queue();
    state.plans.set(a.url, {
      levels: [6, 5, 4, 3],
      costs: { 5: 483_617, 6: 40_000 },
    });
    value.update([a], false);
    await flush();
    value.update([a], false);
    await flush();
    expect(state.events.filter((event) => event.startsWith("fetch:"))).toEqual([
      `fetch:${a.url}:6:low`,
    ]);
    expect(state.instances[0].prefetchBudget.remainingBytes).toBe(
      500_000 - 16_384 - 40_000
    );
    expect(await value.readBase(a, new AbortController().signal)).toBeDefined();
  });
  it("resumes after a foreground pause interrupts the L6 budget fallback", async () => {
    const a = source(),
      value = queue();
    let interrupted = true;
    state.plans.set(a.url, {
      costs: { 5: 500_000 },
      fetch: (level: number, signal: AbortSignal) =>
        level === 6 && interrupted
          ? new Promise<void>((_, reject) =>
              signal.addEventListener("abort", () => reject(signal.reason), {
                once: true,
              })
            )
          : Promise.resolve(),
    });
    value.update([a], false);
    await flush();
    value.update([a], true);
    await flush();
    interrupted = false;
    value.update([a], false);
    await flush();
    expect(
      state.events.filter((event) => event === `fetch:${a.url}:6:low`)
    ).toHaveLength(2);
    expect(await value.readBase(a, new AbortController().signal)).toBeDefined();
    expect(state.instances[0].prefetchBudget.remainingBytes).toBe(
      500_000 - 16_384 - 2 * 40_000
    );
  });
  it("does no work while paused and resumes queued candidates", async () => {
    const a = source(),
      value = queue();
    value.update([a], true);
    await flush();
    expect(state.instances).toHaveLength(0);
    value.update([a], false);
    await flush();
    expect(state.instances).toHaveLength(1);
  });
  it("disposes an in-flight metadata source on pause, retaining its already spent budget on retry", async () => {
    const a = source();
    let started!: () => void;
    const began = new Promise<void>((resolve) => {
      started = resolve;
    });
    state.plans.set(a.url, {
      open: (signal: AbortSignal) =>
        new Promise<void>((_, reject) => {
          started();
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    });
    const value = queue();
    value.update([a], false);
    await vi.advanceTimersByTimeAsync(0);
    await began;
    const budget = state.instances[0].prefetchBudget;
    expect(budget.remainingBytes).toBe(483_616);
    value.update([a], true);
    await flush();
    expect(state.instances[0].dispose).toHaveBeenCalled();
    state.plans.set(a.url, { levels: [6] });
    value.update([a], false);
    await flush();
    expect(state.instances[1].prefetchBudget).toBe(budget);
    expect(budget.remainingBytes).toBe(427_232);
  });
  it("cancels removed candidates and dispose prevents further dispatches", async () => {
    const a = source(),
      value = queue();
    value.update([a], false);
    value.update([], false);
    await flush();
    expect(state.instances).toHaveLength(0);
    value.update([a], false);
    value.dispose();
    await flush();
    value.update([a], false);
    await flush();
    expect(state.instances).toHaveLength(0);
  });
  it("readBase never creates or fetches a missing image and aborts decode without publishing a canvas", async () => {
    const a = source(),
      value = queue();
    expect(
      await value.readBase(a, new AbortController().signal)
    ).toBeUndefined();
    expect(state.instances).toHaveLength(0);
    value.update([a], false);
    await flush();
    const requests = state.events.filter(
      (event) => !event.startsWith("decode:")
    );
    const signal = new AbortController();
    signal.abort();
    expect(await value.readBase(a, signal.signal)).toBeUndefined();
    expect(
      state.events.filter((event) => !event.startsWith("decode:"))
    ).toEqual(requests);
  });
  it("visits all candidates even when the retained source cache is capped", async () => {
    const sources = Array.from({ length: 130 }, () => source());
    const value = queue();
    value.update(sources, false);
    await flush();
    expect(state.events.filter((event) => /:5:low$/.test(event))).toHaveLength(
      130
    );
    expect(
      state.instances.filter(
        (instance) => instance.dispose.mock.calls.length === 0
      ).length
    ).toBeLessThanOrEqual(128);
  });
  it("isolates cached decoding from an in-flight refinement and restores its original allowance", async () => {
    const a = source(),
      value = queue();
    let blockRefinement = true;
    let finishDecode!: () => void;
    let startedDecode!: () => void;
    const decodeStarted = new Promise<void>((resolve) => {
      startedDecode = resolve;
    });
    state.plans.set(a.url, {
      levels: [5, 4],
      fetch: (level: number, signal: AbortSignal) =>
        level === 4 && blockRefinement
          ? new Promise<void>((_, reject) =>
              signal.addEventListener("abort", () => reject(signal.reason), {
                once: true,
              })
            )
          : Promise.resolve(),
      decode: () =>
        new Promise<void>((resolve) => {
          finishDecode = resolve;
          startedDecode();
        }),
    });
    value.update([a], false);
    await flush();
    const instance = state.instances[0],
      originalBudget = instance.prefetchBudget;
    const reading = value.readBase(a, new AbortController().signal);
    expect(instance.pause).toHaveBeenCalled();
    await decodeStarted;
    expect(instance.prefetchBudget.remainingBytes).toBe(0);
    expect(
      await value.readBase(a, new AbortController().signal)
    ).toBeUndefined();
    await flush();
    expect(
      state.events.filter((event) => event === `fetch:${a.url}:4:low`)
    ).toHaveLength(1);
    blockRefinement = false;
    finishDecode();
    expect(await reading).toMatchObject({ width: 32, height: 16 });
    expect(instance.prefetchBudget).toBe(originalBudget);
    await flush();
    expect(
      state.events.filter((event) => event === `fetch:${a.url}:4:low`)
    ).toHaveLength(2);
    expect(originalBudget.remainingBytes).toBe(500_000 - 16_384 - 3 * 40_000);
  });
  it("hover suspension preserves a ready L5 while cancelling refinement, with no decode-time request", async () => {
    const a = source(),
      value = queue();
    state.plans.set(a.url, {
      levels: [5, 4],
      fetch: (level: number, signal: AbortSignal) =>
        level === 4
          ? new Promise<void>((_, reject) =>
              signal.addEventListener("abort", () => reject(signal.reason), {
                once: true,
              })
            )
          : Promise.resolve(),
    });
    value.update([a], false);
    await flush();
    const instance = state.instances[0];
    const eventsBeforeHover = state.events.filter(
      (event) => !event.startsWith("decode:")
    );
    value.update([a], true);
    await flush();
    expect(instance.pause).toHaveBeenCalled();
    expect(instance.dispose).not.toHaveBeenCalled();
    expect(await value.readBase(a, new AbortController().signal)).toMatchObject(
      { width: 32, height: 16 }
    );
    expect(
      state.events.filter((event) => !event.startsWith("decode:"))
    ).toEqual(eventsBeforeHover);
    expect(instance.prefetchBudget.remainingBytes).toBe(
      500_000 - 16_384 - 2 * 40_000
    );
  });
  it("restores the ledger and read lock even when canvas allocation fails", async () => {
    const a = source(),
      value = queue();
    value.update([a], false);
    await flush();
    const instance = state.instances[0],
      budget = instance.prefetchBudget;
    const canvasClass = globalThis.OffscreenCanvas;
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        constructor() {
          throw new Error("allocation failed");
        }
      }
    );
    expect(
      await value.readBase(a, new AbortController().signal)
    ).toBeUndefined();
    expect(instance.prefetchBudget).toBe(budget);
    vi.stubGlobal("OffscreenCanvas", canvasClass);
    expect(await value.readBase(a, new AbortController().signal)).toMatchObject(
      { width: 32, height: 16 }
    );
  });
});
