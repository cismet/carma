import type { DevicePixels, Ratio } from "@carma-units";
import type { ImageLevel, ImageView } from "../core/image-level-plan";
import { ImageLevelStack } from "./image-level-stack";
import type {
  ImagePyramid,
  ImageTileRef,
  ImageTileSource,
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
  readonly calls: { tiles: ImageTileRef[]; priority?: string; done: boolean }[] =
    [];
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
      if (this.holdFetch) await new Promise<void>((go) => this.waiting.push(go));
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
