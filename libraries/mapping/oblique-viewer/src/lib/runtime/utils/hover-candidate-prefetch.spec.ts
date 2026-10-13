import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DevicePixels, Ratio } from "@carma-units";
import {
  ImageLevelStackPool,
  ImagePrefetchBudgetExceeded,
  type ImageLevel,
  type ImagePyramid,
  type ImagePyramidSource,
  type ImagePrefetchBudget,
  type ImageTileRef,
  type ImageTileSource,
} from "@carma-commons/image-pyramid";

const state = vi.hoisted(() => ({
  instances: [] as any[],
  events: [] as string[],
  plans: new Map<string, any>(),
  sharedInstances: [] as SharedSource[],
  pool: null as ImageLevelStackPool | null,
  unexpectedAvif: vi.fn(),
}));
vi.mock("./native-preview-pool", () => ({
  nativePixelPool: {
    acquireDemand: (
      ...args: Parameters<ImageLevelStackPool["acquireDemand"]>
    ) => state.pool!.acquireDemand(...args),
    peek: (...args: Parameters<ImageLevelStackPool["peek"]>) =>
      state.pool!.peek(...args),
    hasForeground: (
      ...args: Parameters<ImageLevelStackPool["hasForeground"]>
    ) => state.pool!.hasForeground(...args),
    subscribe: (...args: Parameters<ImageLevelStackPool["subscribe"]>) =>
      state.pool!.subscribe(...args),
  },
}));
vi.mock("@carma-commons/image-pyramid", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@carma-commons/image-pyramid")
  >();
  return { ...actual, AvifTileSource: state.unexpectedAvif };
});
import { createHoverCandidatePrefetch } from "./hover-candidate-prefetch";

/** The real shared pool/stack owns all decoding; this fixture only supplies I/O. */
class SharedSource implements ImageTileSource {
  readonly kind = "avif" as const;
  priority: "high" | "low" = "high";
  prefetchBudget?: ImagePrefetchBudget;
  readonly resident = new Set<number>();
  readonly bitmaps: Array<{
    width: number;
    height: number;
    close: ReturnType<typeof vi.fn>;
  }> = [];
  compressedBytes = 0;
  requestCount = 0;
  readonly native = {
    width: 2048 as DevicePixels,
    height: 1024 as DevicePixels,
  };
  constructor(readonly url: string) {
    state.sharedInstances.push(this);
  }
  private charge(bytes: number) {
    if (this.prefetchBudget && bytes > this.prefetchBudget.remainingBytes)
      throw new ImagePrefetchBudgetExceeded();
    if (this.prefetchBudget) this.prefetchBudget.remainingBytes -= bytes;
    this.compressedBytes += bytes;
    this.requestCount++;
  }
  private levels(): ImageLevel[] {
    return (state.plans.get(this.url)?.levels ?? [4, 3]).map(
      (level: number) => {
        const width = (this.native.width / 2 ** level) as DevicePixels;
        const height = (this.native.height / 2 ** level) as DevicePixels;
        return {
          level,
          width,
          height,
          tileWidth: width,
          tileHeight: height,
          cols: 1,
          rows: 1,
        };
      }
    );
  }
  open = vi.fn(async (signal: AbortSignal): Promise<ImagePyramid> => {
    const plan = state.plans.get(this.url) ?? {};
    this.charge(plan.metadata ?? 16_384);
    state.events.push(`shared-open:${this.url}`);
    await plan.open?.(signal);
    signal.throwIfAborted();
    return { native: this.native, levels: this.levels() };
  });
  hasBytes = (tile: ImageTileRef) => this.resident.has(tile.level);
  fetch = vi.fn(
    async (
      tiles: readonly ImageTileRef[],
      signal: AbortSignal,
      priority?: "high" | "low",
      onTileReady?: (tile: ImageTileRef) => void
    ) => {
      for (const tile of tiles) {
        if (this.hasBytes(tile)) continue;
        const plan = state.plans.get(this.url) ?? {};
        this.charge(plan.costs?.[tile.level] ?? 40_000);
        state.events.push(`shared-fetch:${this.url}:${tile.level}:${priority}`);
        await plan.fetch?.(tile.level, signal);
        signal.throwIfAborted();
        this.resident.add(tile.level);
        onTileReady?.(tile);
      }
    }
  );
  decode = vi.fn(
    async (tile: ImageTileRef, signal: AbortSignal): Promise<ImageBitmap> => {
      if (!this.hasBytes(tile))
        throw new Error("decode requested uncached bytes");
      const plan = state.plans.get(this.url) ?? {};
      await plan.decode?.(signal);
      signal.throwIfAborted();
      const level = this.levels().find((entry) => entry.level === tile.level)!;
      const bitmap = {
        width: level.width,
        height: level.height,
        close: vi.fn(),
      };
      this.bitmaps.push(bitmap);
      state.events.push(`shared-decode:${this.url}:${tile.level}`);
      return bitmap as unknown as ImageBitmap;
    }
  );
  pause = vi.fn();
  dispose = vi.fn();
}

let sequence = 0;
const source = (kind: "avif" = "avif"): ImagePyramidSource => ({
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
  state.sharedInstances.length = 0;
  state.unexpectedAvif.mockClear();
  state.pool = new ImageLevelStackPool({
    maxImages: 256,
    maxDecodedBytes: 256 * 1024 * 1024,
    maxCompressedBytes: 64 * 1024 * 1024,
    stackOptions: { idlePrefetch: "none" },
    createSource: (input) => new SharedSource(input.url),
  });
  state.events.length = 0;
  state.plans.clear();
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      context = { drawImage: vi.fn(), clearRect: vi.fn() };
      constructor(public width: number, public height: number) {}
      getContext() {
        return this.context;
      }
    }
  );
});
afterEach(() => {
  queues.splice(0).forEach((value) => value.dispose());
  state.pool?.dispose();
  state.pool = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AVIF hover preparation through the shared image pool", () => {
  const sharedFetches = () =>
    state.events.filter((event) => event.startsWith("shared-fetch:"));
  const imageView = (density: number) => ({
    visible: {
      x: 0 as DevicePixels,
      y: 0 as DevicePixels,
      width: 2048 as DevicePixels,
      height: 1024 as DevicePixels,
    },
    density: density as Ratio,
  });

  it("does no preparation while paused and resumes every unique candidate through the pool", async () => {
    const a = source(),
      b = source(),
      value = queue();
    value.update([a, a, b], true);
    await flush();
    expect(state.sharedInstances).toEqual([]);
    value.update([a, a, b], false);
    await flush();
    expect(state.sharedInstances.map((instance) => instance.url)).toEqual([
      a.url,
      b.url,
    ]);
    expect(sharedFetches()).toEqual([
      `shared-fetch:${a.url}:4:low`,
      `shared-fetch:${b.url}:4:low`,
      `shared-fetch:${a.url}:3:low`,
      `shared-fetch:${b.url}:3:low`,
    ]);
    const before = sharedFetches().length;
    value.update([], false);
    value.update([a, b], false);
    await flush();
    expect(sharedFetches()).toHaveLength(before);
    expect(state.sharedInstances).toHaveLength(2);
  });

  it("does not dispatch queued candidates after the prefetch wrapper is disposed", async () => {
    const a = source(),
      b = source(),
      value = queue();
    value.update([a, b], true);
    value.dispose();
    await flush();
    expect(state.sharedInstances).toEqual([]);
    expect(sharedFetches()).toEqual([]);
  });

  it("loads native L4/L3 in rounds through one source per image, without independent AVIF sources or decoding", async () => {
    const a = source("avif"),
      b = source("avif"),
      value = queue();
    state.plans.set(a.url, { levels: [4, 3, 2, 1] });
    state.plans.set(b.url, { levels: [4, 3, 2, 1] });
    value.update([a, b], false);
    await flush();
    expect(sharedFetches()).toEqual([
      `shared-fetch:${a.url}:4:low`,
      `shared-fetch:${b.url}:4:low`,
      `shared-fetch:${a.url}:3:low`,
      `shared-fetch:${b.url}:3:low`,
    ]);
    expect(state.sharedInstances).toHaveLength(2);
    expect(state.unexpectedAvif).not.toHaveBeenCalled();
    expect(state.instances).toHaveLength(0);
    for (const instance of state.sharedInstances) {
      expect(instance.open).toHaveBeenCalledTimes(1);
      expect(instance.decode).not.toHaveBeenCalled();
      expect(instance.dispose).not.toHaveBeenCalled();
    }
  });

  it("includes metadata in the total 500000-byte allowance and preserves cached bytes after wrapper disposal", async () => {
    const a = source("avif"),
      value = queue();
    state.plans.set(a.url, { levels: [4, 3], costs: { 4: 483_616, 3: 1 } });
    value.update([a], false);
    await flush();
    const instance = state.sharedInstances[0];
    expect(instance.compressedBytes).toBe(500_000);
    expect(sharedFetches()).toEqual([`shared-fetch:${a.url}:4:low`]);
    expect(instance.decode).not.toHaveBeenCalled();
    const cached = state.pool!.peek(a);
    value.dispose();
    expect(instance.dispose).not.toHaveBeenCalled();
    expect(instance.resident.has(4)).toBe(true);
    expect(state.pool!.peek(a)).toBe(cached);
    const replacement = queue();
    replacement.update([a], false);
    await flush();
    expect(instance.compressedBytes).toBe(500_000);
    expect(state.sharedInstances).toHaveLength(1);
    expect(
      await replacement.readBase(a, new AbortController().signal)
    ).toMatchObject({ width: 128, height: 64 });
    expect(instance.compressedBytes).toBe(500_000);
  });

  it("rejects an over-budget payload before dispatch and keeps pool-owned metadata intact", async () => {
    const a = source("avif"),
      value = queue();
    state.plans.set(a.url, { levels: [4], costs: { 4: 483_617 } });
    value.update([a], false);
    await flush();
    expect(sharedFetches()).toEqual([]);
    expect(state.sharedInstances[0].compressedBytes).toBe(16_384);
    expect(state.sharedInstances[0].dispose).not.toHaveBeenCalled();
    expect(
      await value.readBase(a, new AbortController().signal)
    ).toBeUndefined();
    expect(state.sharedInstances[0].decode).not.toHaveBeenCalled();
  });

  it("skips an image held by the foreground while preparing other candidates", async () => {
    const a = source("avif"),
      b = source("avif");
    state.plans.set(a.url, { levels: [4] });
    state.plans.set(b.url, { levels: [4] });
    const active = state.pool!.acquire(a);
    await active.stack.ready;
    active.stack.setView(imageView(1 / 16), 128 * 64);
    await flush();
    const current = state.sharedInstances[0];
    const before = current.fetch.mock.calls.length;
    const plan = active.stack.plan;
    const value = queue();
    value.update([a, b], false);
    await flush();
    expect(current.fetch).toHaveBeenCalledTimes(before);
    expect(current.prefetchBudget).toBeUndefined();
    expect(active.stack.plan).toBe(plan);
    expect(sharedFetches()).toContain(`shared-fetch:${b.url}:4:low`);
    expect(
      state.sharedInstances.filter((instance) => instance.url === a.url)
    ).toHaveLength(1);
    value.dispose();
    expect(current.dispose).not.toHaveBeenCalled();
    active.release();
  });

  it("borrows already decoded shared pixels on repeated readBase calls without extra decode, fetch or bitmap close", async () => {
    const a = source("avif"),
      value = queue();
    state.plans.set(a.url, { levels: [4] });
    const active = state.pool!.acquire(a);
    await active.stack.ready;
    active.stack.setView(imageView(1 / 16), 128 * 64);
    await flush();
    const instance = state.sharedInstances[0];
    const requests = instance.requestCount;
    const plan = active.stack.plan;
    expect(instance.decode).toHaveBeenCalledTimes(1);
    const first = await value.readBase(a, new AbortController().signal);
    const second = await value.readBase(a, new AbortController().signal);
    expect(first).toMatchObject({ width: 128, height: 64 });
    expect(second).toMatchObject({ width: 128, height: 64 });
    expect(first).not.toBe(second);
    expect(instance.decode).toHaveBeenCalledTimes(1);
    expect(instance.requestCount).toBe(requests);
    expect(active.stack.plan).toBe(plan);
    expect(instance.prefetchBudget).toBeUndefined();
    expect(instance.bitmaps[0].close).not.toHaveBeenCalled();
    value.dispose();
    expect(instance.bitmaps[0].close).not.toHaveBeenCalled();
    expect(instance.dispose).not.toHaveBeenCalled();
    active.release();
  });

  it("decodes the finest cached coarse level once and reuses it across wrapper lifetimes", async () => {
    const a = source("avif"),
      value = queue();
    value.update([a], false);
    await flush();
    const instance = state.sharedInstances[0];
    const requests = instance.requestCount;
    expect(instance.decode).not.toHaveBeenCalled();
    expect(await value.readBase(a, new AbortController().signal)).toMatchObject(
      { width: 256, height: 128 }
    );
    expect(instance.decode).toHaveBeenCalledTimes(1);
    expect(instance.decode.mock.calls[0][0].level).toBe(3);
    value.dispose();
    const replacement = queue();
    expect(
      await replacement.readBase(a, new AbortController().signal)
    ).toMatchObject({ width: 256, height: 128 });
    expect(instance.decode).toHaveBeenCalledTimes(1);
    expect(instance.requestCount).toBe(requests);
    expect(instance.bitmaps[0].close).not.toHaveBeenCalled();
  });

  it("cancelling a same-image hover read never changes or pauses the active high-priority view", async () => {
    const a = source("avif"),
      value = queue();
    state.plans.set(a.url, { levels: [4] });
    const active = state.pool!.acquire(a);
    await active.stack.ready;
    active.stack.setView(imageView(1 / 16), 128 * 64);
    await flush();
    const instance = state.sharedInstances[0];
    const paused = instance.pause.mock.calls.length;
    const plan = active.stack.plan;
    const controller = new AbortController();
    controller.abort();
    expect(await value.readBase(a, controller.signal)).toBeUndefined();
    value.update([a], true);
    value.dispose();
    expect(active.stack.plan).toBe(plan);
    expect(active.stack.visibleReady).toBe(true);
    expect(state.pool!.hasForeground(a)).toBe(true);
    expect(instance.pause).toHaveBeenCalledTimes(paused);
    expect(instance.prefetchBudget).toBeUndefined();
    expect(instance.priority).toBe("high");
    expect(instance.dispose).not.toHaveBeenCalled();
    expect(instance.bitmaps[0].close).not.toHaveBeenCalled();
    active.release();
  });

  it("does not create a pool source when a cached base is absent", async () => {
    const a = source("avif"),
      value = queue();
    expect(
      await value.readBase(a, new AbortController().signal)
    ).toBeUndefined();
    expect(state.sharedInstances).toEqual([]);
    expect(state.unexpectedAvif).not.toHaveBeenCalled();
  });
});
