import type { DevicePixels, Ratio } from "@carma-units";
import type { ImageLevel, ImageView } from "../core/image-level-plan";
import { IMAGE_STACK_WORK, ImageLevelStack } from "./image-level-stack";
import {
  ImagePrefetchBudgetExceeded,
  type ImagePyramid,
  type ImagePrefetchBudget,
  type ImageTileFetchContext,
  type ImageTileRef,
  type ImageTileSource,
} from "./image-tile-source";

const native = { width: 12736 as DevicePixels, height: 19136 as DevicePixels };
const levels: ImageLevel[] = [
  [1, 6368, 9568],
  [2, 3184, 4784],
  [3, 1592, 2392],
  [4, 796, 1196],
  [5, 398, 598],
].map(([level, width, height]) => ({
  level,
  width: width as DevicePixels,
  height: height as DevicePixels,
  tileWidth: Math.min(512, width) as DevicePixels,
  tileHeight: Math.min(512, height) as DevicePixels,
  cols: Math.ceil(width / 512),
  rows: Math.ceil(height / 512),
}));
const key = (tile: ImageTileRef) => `${tile.level}:${tile.col}:${tile.row}`;

class FakeSource implements ImageTileSource {
  readonly kind = "avif" as const;
  readonly url = "https://example.invalid/a.avif";
  readonly local = new Set<string>();
  readonly fetches: ImageTileRef[][] = [];
  readonly decodes: string[] = [];
  readonly bitmaps: { close: () => void; closed: boolean }[] = [];
  compressedBytes = 0;
  requestCount = 0;
  open = async (): Promise<ImagePyramid> => ({ native, levels });
  hasBytes = (tile: ImageTileRef) => this.local.has(key(tile));
  fetch = async (tiles: readonly ImageTileRef[]) => {
    this.fetches.push([...tiles]);
    tiles.forEach((tile) => this.local.add(key(tile)));
  };
  decode = async (tile: ImageTileRef) => {
    this.decodes.push(key(tile));
    const bitmap = {
      width: 512,
      height: 512,
      closed: false,
      close() {
        this.closed = true;
      },
    };
    this.bitmaps.push(bitmap);
    return bitmap as unknown as ImageBitmap;
  };
  paused = 0;
  pause = () => {
    this.paused++;
  };
  dispose = () => undefined;
}

const view = (cx: number, cy: number, density: number): ImageView => ({
  visible: {
    x: (cx - 700 / density) as DevicePixels,
    y: (cy - 415 / density) as DevicePixels,
    width: (1400 / density) as DevicePixels,
    height: (830 / density) as DevicePixels,
  },
  density: density as Ratio,
});
const settle = async () => {
  for (let i = 0; i < 200; i++) await Promise.resolve();
};
const MiB = 1024 * 1024;

describe("ImageLevelStack", () => {
  it("keeps an L3 viewport within its planned ROI after idle without fetching L2 or L1", async () => {
    vi.useFakeTimers();
    const source = new FakeSource();
    const stack = new ImageLevelStack(source, {
      idlePrefetch: "none",
      prefetchFiner: false,
      ringTiles: 0,
      zoomOutFactor: 1,
    });
    try {
      await stack.ready;
      stack.setView(
        {
          visible: {
            x: 4096 as DevicePixels,
            y: 4096 as DevicePixels,
            width: 2048 as DevicePixels,
            height: 2048 as DevicePixels,
          },
          density: 0.1 as Ratio,
        },
        205 ** 2,
        "in"
      );
      await settle();
      expect(stack.plan!.target).toBe(3);
      expect(stack.plan!.finer).toBeNull();
      expect(stack.visibleReady).toBe(true);
      const requests = source.fetches.length;
      await vi.advanceTimersByTimeAsync(1000);
      await settle();
      expect(source.fetches).toHaveLength(requests);
      expect(source.fetches.flat().every((tile) => tile.level >= 3)).toBe(true);
      expect(source.fetches.flat().filter((tile) => tile.level === 3)).toEqual([
        expect.objectContaining({ level: 3, col: 1, row: 1 }),
      ]);
    } finally {
      stack.dispose();
      vi.useRealTimers();
    }
  });

  it("allows an explicit L1 query while keeping the L3 primary plan unchanged", async () => {
    const source = new FakeSource();
    const stack = new ImageLevelStack(source, {
      idlePrefetch: "none",
      prefetchFiner: false,
      ringTiles: 0,
      zoomOutFactor: 1,
    });
    const region = {
      visible: {
        x: 4096 as DevicePixels,
        y: 4096 as DevicePixels,
        width: 2048 as DevicePixels,
        height: 2048 as DevicePixels,
      },
      density: 0.1 as Ratio,
    };
    const demand = stack.acquireDemand({ priority: "high" });
    try {
      await stack.ready;
      stack.setView(region, 205 ** 2);
      await settle();
      const primary = stack.plan;
      expect(primary!.target).toBe(3);
      expect(source.fetches.flat().every((tile) => tile.level >= 3)).toBe(true);
      demand.setView(
        {
          visible: {
            x: 10240 as DevicePixels,
            y: 15360 as DevicePixels,
            width: 512 as DevicePixels,
            height: 512 as DevicePixels,
          },
          density: 0.5 as Ratio,
        },
        256 ** 2
      );
      await settle();
      expect(demand.plan!.target).toBe(1);
      expect(demand.visibleReady).toBe(true);
      expect(stack.plan).toBe(primary);
      expect(source.fetches.flat().filter((tile) => tile.level === 1)).toEqual([
        expect.objectContaining({ level: 1, col: 10, row: 15 }),
      ]);
    } finally {
      demand.release();
      stack.dispose();
    }
  });

  it("decodes the underlay before the target and never exceeds its budget", async () => {
    const source = new FakeSource();
    const stack = new ImageLevelStack(source, {
      decodedBudget: () => 40 * MiB,
      idlePrefetch: "none",
    });
    await stack.ready;
    stack.setView(view(6000, 9000, 0.3), 1400 * 830);
    await settle();
    const first = (level: number) =>
      source.decodes.findIndex((tile) => tile.startsWith(`${level}:`));
    // Floor, then the parent underlay, then the target level.
    expect(first(5)).toBe(0);
    expect(first(2)).toBeLessThan(first(1));
    expect(stack.metrics.decodedBytes).toBeLessThanOrEqual(40 * MiB);
    expect(stack.metrics.visibleReady).toBe(true);
  });

  it("batches missing tiles of one level and priority into one fetch", async () => {
    const source = new FakeSource();
    const stack = new ImageLevelStack(source, { idlePrefetch: "none" });
    await stack.ready;
    stack.setView(view(6000, 9000, 0.3), 1400 * 830);
    await settle();
    for (const batch of source.fetches)
      expect(new Set(batch.map((tile) => tile.level)).size).toBe(1);
    expect(source.fetches[0].length).toBeGreaterThan(1);
  });

  it("does not replan or notify for an unchanged view", async () => {
    const source = new FakeSource();
    const stack = new ImageLevelStack(source, { idlePrefetch: "none" });
    await stack.ready;
    stack.setView(view(6000, 9000, 0.3), 1400 * 830);
    await settle();
    const changes = vi.fn();
    stack.subscribe(changes);
    stack.setView(view(6000, 9000, 0.3), 1400 * 830);
    await settle();
    expect(changes).not.toHaveBeenCalled();
  });

  it("evicts tiles outside the plan first when the view moves", async () => {
    const source = new FakeSource();
    const stack = new ImageLevelStack(source, {
      decodedBudget: () => 48 * MiB,
      idlePrefetch: "none",
    });
    await stack.ready;
    const evicted: string[] = [];
    stack.onEvict((tile) => evicted.push(tile));
    stack.setView(view(3000, 3000, 0.3), 1400 * 830);
    await settle();
    stack.setView(view(9000, 15000, 0.3), 1400 * 830);
    await settle();
    expect(stack.metrics.decodedBytes).toBeLessThanOrEqual(48 * MiB);
    expect(stack.metrics.visibleReady).toBe(true);
    const plan = new Set(
      stack.plan!.wants.filter((want) => want.decode).map((want) => want.key)
    );
    expect(evicted.some((tile) => plan.has(tile))).toBe(false);
  });

  it("parks to a small budget keeping the floor, and resumes on the next view", async () => {
    const source = new FakeSource();
    const stack = new ImageLevelStack(source, {
      parkedBudgetBytes: 4 * MiB,
      idlePrefetch: "none",
    });
    await stack.ready;
    stack.setView(view(6000, 9000, 0.1), 1400 * 830);
    await settle();
    expect(stack.plan!.floor).toBe(5);
    stack.park();
    expect(source.paused).toBe(1);
    expect(stack.metrics.decodedBytes).toBeLessThanOrEqual(4 * MiB);
    expect(stack.isResident(5, 0, 0)).toBe(true);
    stack.setView(view(6000, 9000, 0.1), 1400 * 830);
    await settle();
    expect(stack.metrics.visibleReady).toBe(true);
  });

  it("is not visible-ready before a thumbnail's floor target is resident", async () => {
    const source = new FakeSource();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetch = source.fetch;
    source.fetch = async (tiles) => {
      await held;
      await fetch(tiles);
    };
    const stack = new ImageLevelStack(source, { idlePrefetch: "none" });
    await stack.ready;
    stack.setView(view(6368, 9568, 0.01), 1400 * 830);
    await settle();
    expect(stack.plan!.target).toBe(stack.plan!.floor);
    expect(stack.metrics.decodedTiles).toBe(0);
    expect(stack.metrics.visibleReady).toBe(false);
    release();
    await settle();
    expect(stack.isResident(5, 0, 0) && stack.isResident(5, 0, 1)).toBe(true);
    expect(stack.metrics.visibleReady).toBe(true);
  });

  it("closes every bitmap on dispose", async () => {
    const source = new FakeSource();
    const stack = new ImageLevelStack(source, { idlePrefetch: "none" });
    await stack.ready;
    stack.setView(view(6000, 9000, 0.3), 1400 * 830);
    await settle();
    stack.dispose();
    expect(source.bitmaps.every((bitmap) => bitmap.closed)).toBe(true);
  });
});

const CRITICAL_ROLES = new Set([
  "floor",
  "underlay",
  "target",
  "target-periphery",
]);

/** Records priorities; fetches and decodes can be held back by the test. */
class GatedSource extends FakeSource {
  readonly calls: {
    tiles: ImageTileRef[];
    priority?: string;
    done: boolean;
  }[] = [];
  holdFetch = false;
  holdDecode = false;
  private readonly waiting: (() => void)[] = [];
  constructor() {
    super();
    const fetchBytes = this.fetch;
    const decodeTile = this.decode;
    this.fetch = async (tiles, _signal?: AbortSignal, priority?: string) => {
      const call = { tiles: [...tiles], priority, done: false };
      this.calls.push(call);
      if (this.holdFetch)
        await new Promise<void>((go) => this.waiting.push(go));
      await fetchBytes(tiles);
      call.done = true;
    };
    this.decode = async (tile) => {
      if (this.holdDecode)
        await new Promise<void>((go) => this.waiting.push(go));
      return decodeTile(tile);
    };
  }
  releaseAll() {
    this.holdFetch = this.holdDecode = false;
    for (const go of this.waiting.splice(0)) go();
  }
}

const createGate = (open = false) => {
  const listeners = new Set<() => void>();
  return {
    open,
    isOpen() {
      return this.open;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next: boolean) {
      this.open = next;
      for (const listener of listeners) listener();
    },
    listeners,
  };
};

describe("ImageLevelStack foreground-first scheduling", () => {
  it("is foreground-pending until the visible target is decoded, not when parked", async () => {
    const source = new FakeSource();
    const stack = new ImageLevelStack(source, { idlePrefetch: "none" });
    expect(stack.foregroundPending).toBe(true);
    await stack.ready;
    stack.setView(view(6000, 9000, 0.2), 1400 * 830);
    expect(stack.foregroundPending).toBe(true);
    await settle();
    expect(stack.visibleReady).toBe(true);
    expect(stack.foregroundPending).toBe(false);
    stack.setView(view(2000, 2000, 0.2), 1400 * 830);
    expect(stack.foregroundPending).toBe(true);
    stack.park();
    expect(stack.foregroundPending).toBe(false);
  });

  it("fetches only visible-priority tiles, all at high priority, until the target is decoded", async () => {
    const source = new GatedSource();
    source.holdDecode = true;
    const stack = new ImageLevelStack(source, { idlePrefetch: "pyramid" });
    await stack.ready;
    stack.setView(view(6000, 9000, 0.2), 1400 * 830);
    await settle();
    const roles = new Map(
      stack.plan!.wants.map((want) => [want.key, want.role])
    );
    expect(stack.plan!.finer).not.toBeNull();
    expect(stack.foregroundPending).toBe(true);
    expect(source.calls.length).toBeGreaterThan(0);
    for (const call of source.calls) {
      expect(call.priority).toBe("high");
      for (const tile of call.tiles)
        expect(CRITICAL_ROLES.has(roles.get(key(tile))!)).toBe(true);
    }
    const before = source.calls.length;
    source.releaseAll();
    await settle();
    expect(stack.visibleReady).toBe(true);
    // Rings and the next finer level follow once the visible target is resident.
    expect(
      source.calls
        .slice(before)
        .some((call) =>
          call.tiles.some((tile) => tile.level === stack.plan!.finer)
        )
    ).toBe(true);
  });

  it("starts no speculative batch while a visible-priority batch is in flight", async () => {
    const source = new GatedSource();
    const stack = new ImageLevelStack(source, { idlePrefetch: "none" });
    await stack.ready;
    stack.setView(view(6000, 9000, 0.2), 1400 * 830);
    await settle();
    expect(stack.visibleReady).toBe(true);
    source.holdFetch = true;
    const before = source.calls.length;
    // Panning needs new target tiles (high) and new finer tiles (low).
    stack.setView(view(3000, 14000, 0.2), 1400 * 830);
    await settle();
    const held = source.calls.slice(before);
    expect(held.length).toBeGreaterThan(0);
    expect(held.every((call) => call.priority === "high")).toBe(true);
    source.releaseAll();
    await settle();
    const later = source.calls.slice(before + held.length);
    const firstLow = source.calls.findIndex(
      (call, index) => index >= before && call.priority === "low"
    );
    expect(firstLow).toBeGreaterThan(-1);
    // Every high request issued before the first low one had completed.
    expect(
      source.calls
        .slice(before, firstLow)
        .every((call) => call.priority === "low" || call.done)
    ).toBe(true);
    expect(later.length).toBeGreaterThan(0);
  });

  it("holds idle prefetch behind a closed host gate and starts it when the gate opens", async () => {
    const source = new GatedSource();
    const gate = createGate(false);
    const stack = new ImageLevelStack(source, {
      idlePrefetch: "next-level",
      ringTiles: 0,
      prefetchGate: gate,
    });
    await stack.ready;
    stack.setView(view(6000, 9000, 0.2), 1400 * 830);
    await settle();
    const finer = stack.plan!.finer!;
    const finerTiles = () =>
      new Set(
        source.calls
          .flatMap((call) => call.tiles)
          .filter((tile) => tile.level === finer)
          .map(key)
      ).size;
    const planned = stack.plan!.wants.filter(
      (want) => want.level === finer
    ).length;
    expect(finerTiles()).toBe(planned);
    gate.set(true);
    await settle();
    expect(finerTiles()).toBeGreaterThan(planned);
    stack.dispose();
    expect(gate.listeners.size).toBe(0);
  });

  it("resolves idle prefetch after source selection and keeps the resolver through configure", async () => {
    const source = new GatedSource();
    const selected: { kind: "avif" | "jpeg" } = { kind: "avif" };
    const stack = new ImageLevelStack(source, {
      idlePrefetch: () => (selected.kind === "jpeg" ? "next-level" : "pyramid"),
      idlePyramidDelayMs: 0,
      ringTiles: 0,
    });
    await stack.ready;
    selected.kind = "jpeg";
    stack.configure({ maxFetches: 2 });
    stack.setView(view(6000, 9000, 0.2), 1400 * 830);
    await settle();
    const count = (level: number) =>
      new Set(
        source.calls
          .flatMap((call) => call.tiles)
          .filter((tile) => tile.level === level)
          .map(key)
      ).size;
    const plan = stack.plan!;
    expect(count(plan.target)).toBe(
      plan.wants.filter((want) => want.level === plan.target).length
    );
    expect(count(plan.finer!)).toBeGreaterThan(
      plan.wants.filter((want) => want.level === plan.finer).length
    );
    stack.dispose();
  });

  it("starts the rest of the pyramid only after the view has rested", async () => {
    const source = new GatedSource();
    const stack = new ImageLevelStack(source, {
      idlePrefetch: "pyramid",
      idlePyramidDelayMs: 60,
    });
    await stack.ready;
    stack.setView(view(6000, 9000, 0.2), 1400 * 830);
    await settle();
    const target = stack.plan!.target;
    const targetTiles = () =>
      new Set(
        source.calls
          .flatMap((call) => call.tiles)
          .filter((tile) => tile.level === target)
          .map(key)
      ).size;
    const planned = stack.plan!.wants.filter(
      (want) => want.level === target
    ).length;
    const whole = levels.find((level) => level.level === target)!;
    expect(planned).toBeLessThan(whole.cols * whole.rows);
    // The next finer level is prefetched at once, the target level's remainder not.
    expect(targetTiles()).toBe(planned);
    await new Promise((resolve) => setTimeout(resolve, 90));
    await settle();
    expect(targetTiles()).toBe(whole.cols * whole.rows);
    stack.dispose();
  });
});

/** A real batch lifetime, with independently arriving complete tiles. */
class ProgressiveSource extends FakeSource {
  readonly batches: {
    tiles: readonly ImageTileRef[];
    signal: AbortSignal;
    ready: (tile: ImageTileRef, store?: boolean) => void;
    finish: () => void;
    fail: (error: Error) => void;
  }[] = [];
  override fetch = (
    tiles: readonly ImageTileRef[],
    signal?: AbortSignal,
    _priority?: "high" | "low",
    onTileReady?: (tile: ImageTileRef) => void
  ) => {
    this.fetches.push([...tiles]);
    return new Promise<void>((resolve, reject) => {
      this.batches.push({
        tiles,
        signal: signal!,
        ready: (tile, store = true) => {
          if (store) this.local.add(key(tile));
          onTileReady?.(tile);
        },
        finish: resolve,
        fail: reject,
      });
    });
  };
}

const progressiveStack = async () => {
  const source = new ProgressiveSource();
  const stack = new ImageLevelStack(source, {
    maxFetches: 1,
    maxDecodes: 1,
    idlePrefetch: "none",
  });
  await stack.ready;
  stack.setWork(IMAGE_STACK_WORK.Visible);
  stack.setView(view(6368, 9568, 0.01), 1400 * 830);
  return { source, stack, batch: source.batches[0] };
};

describe("ImageLevelStack incremental batch readiness", () => {
  it("decodes complete tiles before batch completion without duplicate requests or premature visible readiness", async () => {
    const { source, stack, batch } = await progressiveStack();
    expect(batch.tiles).toHaveLength(2);
    const changes = vi.fn();
    stack.onContentChange(changes);
    batch.ready(batch.tiles[0]);
    batch.ready(batch.tiles[0]);
    await settle();
    expect(source.decodes).toEqual([key(batch.tiles[0])]);
    expect(changes).toHaveBeenCalledTimes(1);
    expect(stack.metrics.fetching).toBe(1);
    expect(stack.visibleReady).toBe(false);
    expect(source.fetches).toHaveLength(1);
    batch.ready(batch.tiles[1]);
    await settle();
    expect(stack.visibleReady).toBe(true);
    expect(stack.metrics.fetching).toBe(1);
    expect(source.fetches).toHaveLength(1);
    batch.finish();
    await settle();
    expect(stack.metrics.fetching).toBe(0);
    expect(stack.error).toBeNull();
    stack.dispose();
  });

  it("does not decode an incomplete notification and retains completion fallback", async () => {
    const { source, stack, batch } = await progressiveStack();
    batch.ready(batch.tiles[0], false);
    await settle();
    expect(source.decodes).toEqual([]);
    for (const tile of batch.tiles) source.local.add(key(tile));
    batch.finish();
    await settle();
    expect(stack.visibleReady).toBe(true);
    expect(source.decodes).toHaveLength(2);
    stack.dispose();
  });

  it("coalesces a synchronous arrival burst and respects decode concurrency", async () => {
    const { source, stack, batch } = await progressiveStack();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const decode = source.decode;
    source.decode = async (tile) => {
      await pending;
      return decode(tile);
    };
    for (let i = 0; i < 10; i++)
      for (const tile of batch.tiles) batch.ready(tile);
    expect(stack.metrics.decoding).toBe(0);
    await Promise.resolve();
    expect(stack.metrics.decoding).toBe(1);
    expect(source.fetches).toHaveLength(1);
    release();
    await settle();
    expect(source.decodes).toHaveLength(2);
    batch.finish();
    await settle();
    stack.dispose();
  });

  it("ignores stale callbacks while parked and after disposal, then resumes from local bytes", async () => {
    const { source, stack, batch } = await progressiveStack();
    stack.park();
    expect(batch.signal.aborted).toBe(true);
    for (const tile of batch.tiles) batch.ready(tile);
    batch.finish();
    await settle();
    expect(source.decodes).toEqual([]);
    stack.setView(view(6368, 9568, 0.01), 1400 * 830);
    await settle();
    expect(stack.visibleReady).toBe(true);
    expect(source.fetches).toHaveLength(1);
    stack.dispose();
    batch.ready(batch.tiles[0]);
    await settle();
    expect(source.decodes).toHaveLength(2);
    expect(source.bitmaps.every((bitmap) => bitmap.closed)).toBe(true);
  });

  it("uses the current plan when the viewport changes during an old batch", async () => {
    const source = new ProgressiveSource();
    source.local.add("5:0:0");
    source.local.add("5:0:1");
    const stack = new ImageLevelStack(source, {
      maxFetches: 1,
      idlePrefetch: "none",
    });
    await stack.ready;
    stack.setView(view(2000, 3000, 0.3), 1400 * 830);
    const old = source.batches[0];
    stack.setView(view(10000, 16000, 0.3), 1400 * 830);
    const current = new Set(
      stack.plan!.wants.filter((want) => want.decode).map((want) => want.key)
    );
    const obsolete = old.tiles.filter((tile) => !current.has(key(tile)));
    expect(obsolete.length).toBeGreaterThan(0);
    for (const tile of old.tiles) old.ready(tile);
    await settle();
    expect(obsolete.every((tile) => !source.decodes.includes(key(tile)))).toBe(
      true
    );
    expect(source.fetches).toHaveLength(1);
    old.finish();
    await settle();
    expect(source.fetches.length).toBeGreaterThan(1);
    stack.dispose();
    for (const batch of source.batches) batch.finish();
    await settle();
  });

  it("keeps already decoded pixels when the rest of a batch fails, without retrying while paused", async () => {
    const { source, stack, batch } = await progressiveStack();
    batch.ready(batch.tiles[0]);
    await settle();
    const stopOnFailure = stack.subscribe(() => {
      if (stack.error) stack.setWork(IMAGE_STACK_WORK.Paused);
    });
    // Keep the remainder local: a failed trailing transport must not discard
    // completed cells, while the original batch error remains observable.
    source.local.add(key(batch.tiles[1]));
    batch.fail(new Error("trailing range failed"));
    await settle();
    expect(stack.error).toBe("trailing range failed");
    expect(
      stack.isResident(
        batch.tiles[0].level,
        batch.tiles[0].col,
        batch.tiles[0].row
      )
    ).toBe(true);
    expect(source.fetches).toHaveLength(1);
    stopOnFailure();
    stack.dispose();
  });
});

describe("ImageLevelStack shared viewport demands", () => {
  it("keeps the primary plan and shares overlapping fetches and decoded tiles", async () => {
    const source = new FakeSource();
    const stack = new ImageLevelStack(source, { idlePrefetch: "none" });
    stack.setWork(IMAGE_STACK_WORK.Paused);
    await stack.ready;
    const current = view(6000, 9000, 0.2);
    stack.setView(current, 1400 * 830);
    const primary = stack.plan;
    const first = stack.acquireDemand({ priority: "low" });
    const second = stack.acquireDemand({ priority: "low" });
    first.setView(current, 1400 * 830);
    second.setView(current, 1400 * 830);
    expect(stack.plan).toBe(primary);
    expect(first.plan).not.toBe(primary);
    stack.setWork(IMAGE_STACK_WORK.Full);
    await settle();
    expect(
      stack.visibleReady && first.visibleReady && second.visibleReady
    ).toBe(true);
    const fetched = source.fetches.flat().map(key);
    expect(new Set(fetched).size).toBe(fetched.length);
    expect(new Set(source.decodes).size).toBe(source.decodes.length);
    const previousFetches = fetched.length;
    first.release();
    first.release();
    expect(first.plan).toBeNull();
    expect(first.visibleReady).toBe(false);
    expect(second.visibleReady).toBe(true);
    expect(stack.plan).toBe(primary);
    expect(source.fetches.flat()).toHaveLength(previousFetches);
    stack.dispose();
  });

  it("loads only the whole floor for a coarse demand and never idles into finer levels", async () => {
    const source = new GatedSource();
    const stack = new ImageLevelStack(source, {
      idlePrefetch: "pyramid",
      idlePyramidDelayMs: 0,
    });
    await stack.ready;
    const changes = vi.fn();
    stack.onContentChange(changes);
    const thumbnail = stack.acquireDemand({
      priority: "low",
      coarseOnly: true,
    });
    thumbnail.setView(view(6000, 9000, 0.4), 256 * 256);
    expect(stack.foregroundPending).toBe(false);
    await settle();
    expect(thumbnail.visibleReady).toBe(true);
    expect(thumbnail.plan!.target).toBe(thumbnail.plan!.floor);
    expect(thumbnail.plan!.layers).toEqual([5]);
    expect(source.calls.every((call) => call.priority === "low")).toBe(true);
    expect(source.decodes).toEqual(["5:0:0", "5:0:1"]);
    expect(
      source.calls
        .flatMap((call) => call.tiles)
        .every((tile) => tile.level === 5)
    ).toBe(true);
    expect(changes).toHaveBeenCalledTimes(2);
    const updates = vi.fn();
    stack.subscribe(updates);
    thumbnail.setView(view(6000, 9000, 0.4), 256 * 256);
    expect(updates).not.toHaveBeenCalled();
    stack.dispose();
  });

  it("finishes high target pixels before disjoint low viewport requests", async () => {
    const source = new GatedSource();
    source.holdDecode = true;
    const stack = new ImageLevelStack(source, { idlePrefetch: "none" });
    stack.setWork(IMAGE_STACK_WORK.Paused);
    await stack.ready;
    const foreground = stack.acquireDemand({ priority: "high" });
    const background = stack.acquireDemand({ priority: "low" });
    foreground.setView(view(2500, 3000, 0.25), 1400 * 830);
    background.setView(view(10000, 16000, 0.25), 1400 * 830);
    stack.setWork(IMAGE_STACK_WORK.Visible);
    await settle();
    expect(stack.foregroundPending).toBe(true);
    expect(source.calls.length).toBeGreaterThan(0);
    expect(source.calls.every((call) => call.priority === "high")).toBe(true);
    source.releaseAll();
    await settle();
    expect(foreground.visibleReady).toBe(true);
    expect(background.visibleReady).toBe(true);
    expect(stack.foregroundPending).toBe(false);
    expect(source.calls.some((call) => call.priority === "low")).toBe(true);
    stack.dispose();
  });

  it("parks the primary without cancelling an independent query or reviving the old view", async () => {
    const source = new FakeSource();
    const stack = new ImageLevelStack(source, { idlePrefetch: "none" });
    await stack.ready;
    stack.setView(view(2500, 3000, 0.2), 1400 * 830);
    await settle();
    const primary = stack.plan;
    const demand = stack.acquireDemand({ priority: "high" });
    demand.setView(view(9000, 15000, 0.2), 1400 * 830);
    stack.park();
    expect(source.paused).toBe(0);
    await settle();
    expect(demand.visibleReady).toBe(true);
    expect(stack.plan).toBe(primary);
    demand.release();
    expect(source.paused).toBe(1);
    expect(stack.foregroundPending).toBe(false);
    const next = stack.acquireDemand({ priority: "low", coarseOnly: true });
    next.setView(view(6000, 9000, 0.01), 256 * 256);
    await settle();
    expect(next.visibleReady).toBe(true);
    expect(stack.foregroundPending).toBe(false);
    expect(stack.plan).toBe(primary);
    stack.dispose();
  });

  it("retains decoded parked pixels until explicit pressure and evicts fine levels first", async () => {
    const source = new FakeSource();
    const stack = new ImageLevelStack(source, { idlePrefetch: "none" });
    await stack.ready;
    stack.setView(view(6000, 9000, 0.2), 1400 * 830);
    await settle();
    const bytes = stack.metrics.decodedBytes;
    expect(bytes).toBeGreaterThan(8 * MiB);
    stack.park();
    expect(stack.metrics.decodedBytes).toBe(bytes);
    const evicted: string[] = [];
    stack.onEvict((tile) => evicted.push(tile));
    const compressed = source.local.size;
    const freed = stack.trimDecodedTo(0, { protectDemand: false });
    expect(freed).toBe(bytes - stack.metrics.decodedBytes);
    expect(stack.metrics.decodedBytes).toBe(2 * MiB);
    expect(evicted.map((tile) => Number(tile.split(":")[0]))).toEqual(
      evicted.map((tile) => Number(tile.split(":")[0])).sort((a, b) => a - b)
    );
    expect(stack.isResident(5, 0, 0) && stack.isResident(5, 0, 1)).toBe(true);
    expect(source.local.size).toBe(compressed);
    expect(stack.trimDecodedTo(0, { includeFloor: true })).toBe(2 * MiB);
    expect(stack.metrics.decodedBytes).toBe(0);
    stack.dispose();
  });

  it("always protects high visible target pixels, even when other demands may be trimmed", async () => {
    const source = new FakeSource();
    const stack = new ImageLevelStack(source, { idlePrefetch: "none" });
    await stack.ready;
    const demand = stack.acquireDemand({ priority: "high" });
    demand.setView(view(6000, 9000, 0.2), 1400 * 830);
    await settle();
    const bytes = stack.metrics.decodedBytes;
    expect(stack.trimDecodedTo(0)).toBe(0);
    const freed = stack.trimDecodedTo(0, {
      includeFloor: true,
      protectDemand: false,
    });
    expect(freed).toBeGreaterThan(0);
    expect(stack.metrics.decodedBytes).toBeLessThan(bytes);
    expect(demand.visibleReady).toBe(true);
    demand.release();
    expect(stack.trimDecodedTo(0, { includeFloor: true })).toBeGreaterThan(0);
    expect(stack.metrics.decodedBytes).toBe(0);
    stack.dispose();
  });
});

describe("ImageLevelStack compressed-only demands", () => {
  it("uses stored sub-512 levels for compressed prewarming without changing the primary floor", async () => {
    const source = new FakeSource();
    source.open = async () => ({
      native,
      levels: [
        ...levels,
        {
          level: 6,
          width: 199 as DevicePixels,
          height: 299 as DevicePixels,
          tileWidth: 199 as DevicePixels,
          tileHeight: 299 as DevicePixels,
          cols: 1,
          rows: 1,
        },
      ],
    });
    const stack = new ImageLevelStack(source, { idlePrefetch: "none" });
    await stack.ready;
    const demand = stack.acquireDemand({
      priority: "low",
      coarseOnly: true,
      decode: false,
    });
    demand.setView(view(6000, 9000, 0.01), 256 * 256);
    await settle();
    expect(demand.plan!.floor).toBe(6);
    expect(source.fetches.flat().map(key)).toEqual(["6:0:0"]);
    expect(source.decodes).toEqual([]);
    stack.setView(view(6000, 9000, 0.01), 512 * 512);
    await settle();
    expect(stack.plan!.floor).toBe(5);
    expect(stack.visibleReady && demand.visibleReady).toBe(true);
    stack.dispose();
  });

  it("warms the whole floor without decoding or becoming foreground work", async () => {
    const source = new GatedSource();
    source.holdFetch = true;
    const stack = new ImageLevelStack(source, { idlePrefetch: "pyramid" });
    await stack.ready;
    const demand = stack.acquireDemand({
      priority: "low",
      coarseOnly: true,
      decode: false,
    });
    demand.setView(view(6000, 9000, 0.2), 512 * 512);
    expect(demand.visibleReady).toBe(false);
    expect(stack.foregroundPending).toBe(false);
    source.releaseAll();
    await settle();
    expect(demand.visibleReady).toBe(true);
    expect(demand.plan!.wants.every((want) => !want.decode)).toBe(true);
    expect(demand.plan!.decodedBytes).toBe(0);
    expect(stack.metrics.decodedBytes).toBe(0);
    expect(source.decodes).toEqual([]);
    expect(source.local.size).toBe(2);
    expect(source.calls.every((call) => call.priority === "low")).toBe(true);
    stack.dispose();
  });

  it("keeps decoded requirements when a compressed-only demand overlaps the primary", async () => {
    const source = new FakeSource();
    const stack = new ImageLevelStack(source, { idlePrefetch: "none" });
    stack.setWork(IMAGE_STACK_WORK.Paused);
    await stack.ready;
    stack.setView(view(6000, 9000, 0.01), 512 * 512);
    const primary = stack.plan;
    const demand = stack.acquireDemand({
      priority: "low",
      coarseOnly: true,
      decode: false,
    });
    demand.setView(view(6000, 9000, 0.2), 512 * 512);
    stack.setWork(IMAGE_STACK_WORK.Visible);
    await settle();
    expect(stack.plan).toBe(primary);
    expect(stack.visibleReady && demand.visibleReady).toBe(true);
    expect(source.decodes).toHaveLength(2);
    expect(source.fetches.flat()).toHaveLength(2);
    stack.dispose();
  });

  it("notifies compressed readiness as tiles arrive before their batch settles", async () => {
    const source = new ProgressiveSource();
    const stack = new ImageLevelStack(source, { idlePrefetch: "none" });
    await stack.ready;
    const demand = stack.acquireDemand({
      priority: "high",
      coarseOnly: true,
      decode: false,
    });
    demand.setView(view(6000, 9000, 0.01), 512 * 512);
    expect(stack.foregroundPending).toBe(true);
    const readiness: boolean[] = [];
    stack.subscribe(() => readiness.push(demand.visibleReady));
    const batch = source.batches[0];
    for (const tile of batch.tiles) batch.ready(tile);
    await settle();
    expect(readiness).toContain(true);
    expect(demand.visibleReady).toBe(true);
    expect(stack.foregroundPending).toBe(false);
    expect(source.decodes).toEqual([]);
    batch.finish();
    await settle();
    stack.dispose();
  });

  it("stops a low compressed demand when its byte budget is exhausted", async () => {
    const source = new FakeSource();
    let attempts = 0;
    source.fetch = async () => {
      attempts++;
      throw new ImagePrefetchBudgetExceeded();
    };
    const stack = new ImageLevelStack(source, { idlePrefetch: "none" });
    await stack.ready;
    const demand = stack.acquireDemand({
      priority: "low",
      coarseOnly: true,
      decode: false,
      prefetchBudget: { remainingBytes: 0 },
    });
    demand.setView(view(6000, 9000, 0.01), 512 * 512);
    await settle();
    expect(attempts).toBe(1);
    expect(stack.prefetchExhausted).toBe(true);
    expect(demand.prefetchExhausted).toBe(true);
    expect(demand.visibleReady).toBe(false);
    expect(source.decodes).toEqual([]);
    stack.dispose();
  });
});

describe("ImageLevelStack exact cached-level demands", () => {
  it("decodes only the selected cached level without replacing the primary plan or fetching", async () => {
    const source = new FakeSource();
    const stack = new ImageLevelStack(source, { idlePrefetch: "none" });
    await stack.ready;
    stack.setView(view(6000, 9000, 0.2), 1400 * 830);
    await settle();
    const primary = stack.plan;
    // The primary already supplied the whole L5 floor. Density deliberately
    // asks for more detail: an exact snapshot must still remain on cached L5.
    const fetchCount = source.fetches.length;
    const decodeCount = source.decodes.length;
    const demand = stack.acquireDemand({ priority: "low", level: 5 });
    demand.setView(view(6000, 9000, 0.5), 512 * 512);
    await settle();
    expect(stack.plan).toBe(primary);
    expect(demand.plan!.target).toBe(5);
    expect(demand.plan!.layers).toEqual([5]);
    expect(demand.plan!.wants.every((want) => want.level === 5)).toBe(true);
    expect(demand.visibleReady).toBe(true);
    expect(source.fetches).toHaveLength(fetchCount);
    expect(source.decodes).toHaveLength(decodeCount);
    stack.dispose();
  });

  it("decodes a compressed-only cached level once and rejects an absent level without fallback", async () => {
    const source = new FakeSource();
    source.local.add("5:0:0");
    source.local.add("5:0:1");
    const stack = new ImageLevelStack(source, { idlePrefetch: "pyramid" });
    await stack.ready;
    const demand = stack.acquireDemand({ priority: "low", level: 5 });
    demand.setView(view(6000, 9000, 0.5), 512 * 512);
    await settle();
    expect(demand.visibleReady).toBe(true);
    expect(source.fetches).toEqual([]);
    expect(source.decodes).toEqual(["5:0:0", "5:0:1"]);
    const absent = stack.acquireDemand({ priority: "low", level: 99 });
    absent.setView(view(6000, 9000, 0.5), 512 * 512);
    await settle();
    expect(absent.plan).toBeNull();
    expect(absent.visibleReady).toBe(false);
    expect(source.fetches).toEqual([]);
    stack.dispose();
  });
});

describe("ImageLevelStack request budget isolation", () => {
  const smallNative = {
    width: 2048 as DevicePixels,
    height: 512 as DevicePixels,
  };
  const smallLevels: ImageLevel[] = [0, 1, 2].map((level) => ({
    level,
    width: (2048 / 2 ** level) as DevicePixels,
    height: (512 / 2 ** level) as DevicePixels,
    tileWidth: 512 as DevicePixels,
    tileHeight: (512 / 2 ** level) as DevicePixels,
    cols: 4 / 2 ** level,
    rows: 1,
  }));
  const region = (x: number): ImageView => ({
    visible: {
      x: x as DevicePixels,
      y: 0 as DevicePixels,
      width: 256 as DevicePixels,
      height: 256 as DevicePixels,
    },
    density: 1 as Ratio,
  });
  class BudgetSource extends FakeSource {
    prefetchBudget?: ImagePrefetchBudget;
    readonly calls: {
      tiles: readonly ImageTileRef[];
      context?: ImageTileFetchContext;
      charged: number;
    }[] = [];
    constructor() {
      super();
      this.open = async () => ({ native: smallNative, levels: smallLevels });
      this.fetch = async (
        tiles,
        _signal?: AbortSignal,
        _priority?: "high" | "low",
        _onTile?: (tile: ImageTileRef) => void,
        context?: ImageTileFetchContext
      ) => {
        const budget =
          context === undefined ? this.prefetchBudget : context.prefetchBudget;
        const bytes = 60_000 * tiles.length;
        const call = { tiles, context, charged: 0 };
        this.calls.push(call);
        if (budget && bytes > budget.remainingBytes)
          throw new ImagePrefetchBudgetExceeded();
        if (budget) budget.remainingBytes -= bytes;
        call.charged = bytes;
        this.fetches.push([...tiles]);
        for (const tile of tiles) this.local.add(key(tile));
      };
    }
  }

  it("keeps foreground requests unlimited and limits only the disjoint low query despite mutable source state", async () => {
    const source = new BudgetSource();
    const stack = new ImageLevelStack(source, {
      idlePrefetch: "none",
      ringTiles: 0,
      zoomOutFactor: 1,
    });
    stack.setWork(IMAGE_STACK_WORK.Paused);
    await stack.ready;
    const budget = { remainingBytes: 100_000 };
    const high = stack.acquireDemand({ priority: "high" });
    const low = stack.acquireDemand({
      priority: "low",
      decode: false,
      prefetchBudget: budget,
    });
    high.setView(region(0), 256 * 256);
    low.setView(region(1792), 256 * 256);
    source.prefetchBudget = { remainingBytes: 0 };
    stack.setWork(IMAGE_STACK_WORK.Visible);
    await settle();
    expect(high.visibleReady).toBe(true);
    expect(high.prefetchExhausted).toBe(false);
    expect(low.visibleReady).toBe(false);
    expect(low.prefetchExhausted).toBe(true);
    expect(budget.remainingBytes).toBe(40_000);
    expect(source.calls.every((call) => call.context !== undefined)).toBe(true);
    expect(
      source.calls.some(
        (call) => call.context!.prefetchBudget === undefined && call.charged > 0
      )
    ).toBe(true);
    expect(
      source.calls
        .filter((call) => call.context!.prefetchBudget === budget)
        .reduce((sum, call) => sum + call.charged, 0)
    ).toBe(60_000);
    const successful = source.fetches.flat().map(key);
    expect(new Set(successful).size).toBe(successful.length);
    // A later unlimited decode/query can recover the same pixels, despite the
    // first low query's refusal remaining visible in its own diagnostic.
    const unlimited = stack.acquireDemand({ priority: "low" });
    unlimited.setView(region(1792), 256 * 256);
    await settle();
    expect(unlimited.visibleReady).toBe(true);
    expect(unlimited.prefetchExhausted).toBe(false);
    expect(budget.remainingBytes).toBe(40_000);
    stack.dispose();
  });

  it("captures a primary prewarm allowance at setView and removes it on foreground promotion", async () => {
    const source = new BudgetSource();
    const budget = { remainingBytes: 500_000 };
    const stack = new ImageLevelStack(source, { idlePrefetch: "none" });
    stack.setWork(IMAGE_STACK_WORK.Paused);
    await stack.ready;
    source.prefetchBudget = budget;
    stack.setView(region(0), 256 * 256);
    source.prefetchBudget = { remainingBytes: 0 };
    stack.setWork(IMAGE_STACK_WORK.Prewarm);
    await settle();
    expect(stack.visibleReady).toBe(true);
    expect(
      source.calls.every((call) => call.context?.prefetchBudget === budget)
    ).toBe(true);
    const before = source.calls.length;
    const remaining = budget.remainingBytes;
    stack.setWork(IMAGE_STACK_WORK.Full);
    await settle();
    expect(source.calls.length).toBeGreaterThan(before);
    expect(
      source.calls
        .slice(before)
        .every(
          (call) =>
            call.context !== undefined &&
            call.context.prefetchBudget === undefined
        )
    ).toBe(true);
    expect(budget.remainingBytes).toBe(remaining);
    stack.dispose();
  });
});
