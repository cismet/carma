import type { DevicePixels, Ratio } from "@carma-units";
import type { ImageView } from "../core/image-level-plan";
import {
  ImageLevelStackPool,
  type ImagePyramidSource,
} from "./image-level-stack-pool";
import {
  reserveImagePrefetchBytes,
  type ImagePrefetchBudget,
} from "./image-tile-source";
import type {
  ImagePyramid,
  ImageTileRef,
  ImageTileSource,
} from "./image-tile-source";

const MiB = 1024 * 1024;
const pyramid: ImagePyramid = {
  native: { width: 2048 as DevicePixels, height: 2048 as DevicePixels },
  levels: [1, 2, 3, 4].map((level) => {
    const edge = 2048 / 2 ** (level - 1);
    return {
      level,
      width: edge as DevicePixels,
      height: edge as DevicePixels,
      tileWidth: 256 as DevicePixels,
      tileHeight: 256 as DevicePixels,
      cols: edge / 256,
      rows: edge / 256,
    };
  }),
};
const view = (x = 0): ImageView => ({
  visible: {
    x: x as DevicePixels,
    y: 0 as DevicePixels,
    width: 1024 as DevicePixels,
    height: 1024 as DevicePixels,
  },
  density: 0.5 as Ratio,
});
const descriptor = (id: string): ImagePyramidSource => ({
  id,
  kind: "avif",
  url: `https://example.invalid/${id}.avif`,
});
const key = (tile: ImageTileRef) => `${tile.level}:${tile.col}:${tile.row}`;
const settle = async () => {
  for (let i = 0; i < 300; i++) await Promise.resolve();
};

class ControlledSource implements ImageTileSource {
  readonly kind = "avif" as const;
  priority: "high" | "low" = "high";
  prefetchBudget?: ImagePrefetchBudget;
  local = new Set<string>();
  fetches: {
    tiles: readonly ImageTileRef[];
    priority?: string;
    signal: AbortSignal;
  }[] = [];
  decodes: { key: string; signal: AbortSignal }[] = [];
  pending: { finish: () => void; signal: AbortSignal; method: string }[] = [];
  hold = new Set<string>();
  activeDecodes = 0;
  maxDecodes = 0;
  pauses = 0;
  disposed = false;
  openCalls = 0;
  compressedBytes = 0;
  requestCount = 0;
  constructor(readonly url: string) {}
  private wait(method: string, signal: AbortSignal) {
    if (!this.hold.has(method)) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const finish = () => {
        signal.removeEventListener("abort", abort);
        resolve();
      };
      const abort = () => reject(new DOMException("Aborted", "AbortError"));
      this.pending.push({ finish, signal, method });
      if (signal.aborted) abort();
      else signal.addEventListener("abort", abort, { once: true });
    });
  }
  release(method: string) {
    this.hold.delete(method);
    for (const pending of this.pending.filter((item) => item.method === method))
      pending.finish();
  }
  async open(signal: AbortSignal) {
    this.openCalls++;
    await this.wait("open", signal);
    return pyramid;
  }
  hasBytes(tile: ImageTileRef) {
    return this.local.has(key(tile));
  }
  async fetch(
    tiles: readonly ImageTileRef[],
    signal: AbortSignal,
    priority?: "high" | "low"
  ) {
    this.fetches.push({ tiles: [...tiles], priority, signal });
    await this.wait("fetch", signal);
    signal.throwIfAborted();
    for (const tile of tiles) this.local.add(key(tile));
  }
  async decode(tile: ImageTileRef, signal: AbortSignal) {
    this.decodes.push({ key: key(tile), signal });
    this.activeDecodes++;
    this.maxDecodes = Math.max(this.maxDecodes, this.activeDecodes);
    try {
      await this.wait("decode", signal);
      signal.throwIfAborted();
      return { width: 256, height: 256, close: () => undefined } as ImageBitmap;
    } finally {
      this.activeDecodes--;
    }
  }
  pause() {
    this.pauses++;
  }
  dispose() {
    this.disposed = true;
  }
}

const setup = (
  configure?: (source: ControlledSource, id: string) => void,
  decodedBudget?: () => number
) => {
  const sources = new Map<string, ControlledSource>();
  const pool = new ImageLevelStackPool({
    stackOptions: {
      idlePrefetch: "none",
      ringTiles: 0,
      decodeFinerAt: Infinity,
      minLevelEdge: 256 as DevicePixels,
      zoomOutFactor: 1,
      foveaRadius: null,
      decodedBudget,
    },
    createSource(source) {
      const fake = new ControlledSource(source.url);
      configure?.(fake, source.id);
      sources.set(source.id, fake);
      return fake;
    },
  });
  return { pool, sources };
};

describe("ImageLevelStackPool foreground-priority prewarming", () => {
  it("does not even open a forecast until every foreground target is ready", async () => {
    const { pool, sources } = setup((source, id) => {
      if (id === "a" || id === "b") source.hold.add("decode");
    });
    try {
      const a = pool.acquire(descriptor("a")),
        b = pool.acquire(descriptor("b"));
      a.stack.setView(view(), 512 ** 2);
      b.stack.setView(view(), 512 ** 2);
      pool.prewarm(descriptor("warm"), view(), 512 ** 2);
      await settle();
      expect(sources.has("warm")).toBe(false);
      sources.get("a")!.release("decode");
      await settle();
      expect(a.stack.metrics.visibleReady).toBe(true);
      expect(sources.has("warm")).toBe(false);
      sources.get("b")!.release("decode");
      await settle();
      expect(sources.get("warm")?.openCalls).toBe(1);
    } finally {
      pool.dispose();
    }
  });

  it("promotes the same warmed stack without decoding its target again", async () => {
    const { pool, sources } = setup();
    try {
      const cancel = pool.prewarm(descriptor("warm"), view(), 512 ** 2);
      await settle();
      const source = sources.get("warm")!,
        before = source.decodes.length;
      expect(pool.metrics.images[0].visibleReady).toBe(true);
      expect(pool.metrics.images[0].budgetBytes).toBe(96 * MiB);
      const lease = pool.acquire(descriptor("warm"));
      const retained = lease.stack.tile(2, 0, 0);
      expect(retained).toBeDefined();
      cancel();
      lease.stack.setView(view(), 512 ** 2);
      await settle();
      expect(lease.stack.tile(2, 0, 0)).toBe(retained);
      expect(source.openCalls).toBe(1);
      expect(source.decodes.length).toBe(before);
      expect(source.priority).toBe("high");
      expect(pool.metrics.images[0].active).toBe(true);
    } finally {
      pool.dispose();
    }
  });

  it("warms only floor, underlay and target at low priority with one decode", async () => {
    const { pool, sources } = setup((source) => source.hold.add("decode"));
    try {
      pool.prewarm(descriptor("warm"), view(), 512 ** 2);
      await settle();
      const source = sources.get("warm")!;
      expect(source.activeDecodes).toBe(1);
      source.release("decode");
      await settle();
      expect(source.maxDecodes).toBe(1);
      expect(source.priority).toBe("low");
      expect(source.fetches.every((call) => call.priority === "low")).toBe(
        true
      );
      expect(
        source.fetches
          .flatMap((call) => call.tiles)
          .every((tile) => tile.level >= 2)
      ).toBe(true);
      expect(pool.metrics.images[0].visibleReady).toBe(true);
    } finally {
      pool.dispose();
    }
  });

  it.each(["fetch", "decode"])(
    "aborts warm %s when foreground demand changes, retaining resident pixels",
    async (method) => {
      const { pool, sources } = setup();
      try {
        const active = pool.acquire(descriptor("active"));
        active.stack.setView(view(), 512 ** 2);
        await settle();
        pool.prewarm(descriptor("warm"), view(), 512 ** 2);
        await settle();
        const warm = sources.get("warm")!;
        const before = pool.metrics.images.find(
          (image) => image.id === "warm"
        )!.decodedBytes;
        warm.hold.add(method);
        pool.prewarm(descriptor("warm"), view(1024), 512 ** 2);
        await settle();
        const pending = warm.pending.filter(
          (item) => item.method === method && !item.signal.aborted
        );
        expect(pending.length).toBeGreaterThan(0);
        sources.get("active")!.hold.add("decode");
        active.stack.setView(view(1024), 512 ** 2);
        await settle();
        expect(pending.every((item) => item.signal.aborted)).toBe(true);
        expect(
          pool.metrics.images.find((image) => image.id === "warm")!.decodedBytes
        ).toBeGreaterThanOrEqual(before);
        const count = warm.fetches.length + warm.decodes.length;
        await settle();
        expect(warm.fetches.length + warm.decodes.length).toBe(count);
      } finally {
        pool.dispose();
      }
    }
  );

  it("keeps only the latest forecast and ignores stale cancellation", async () => {
    const { pool, sources } = setup();
    try {
      const stale = pool.prewarm(descriptor("old"), view(), 512 ** 2);
      await settle();
      const cancel = pool.prewarm(descriptor("new"), view(), 512 ** 2);
      stale();
      await settle();
      expect(
        pool.metrics.images
          .filter((image) => image.prewarming)
          .map((image) => image.id)
      ).toEqual(["new"]);
      expect(sources.get("old")!.pauses).toBeGreaterThan(0);
      expect(
        pool.metrics.images.find((image) => image.id === "new")!.visibleReady
      ).toBe(true);
      cancel();
      expect(pool.metrics.images.some((image) => image.prewarming)).toBe(false);
    } finally {
      pool.dispose();
    }
  });

  it("resumes foreground finer prefetch once the forecast target is ready", async () => {
    const { pool, sources } = setup((source) => source.hold.add("decode"));
    try {
      const active = pool.acquire(descriptor("active"));
      active.stack.setView(view(), 512 ** 2);
      pool.prewarm(descriptor("warm"), view(), 512 ** 2);
      await settle();
      const foreground = sources.get("active")!;
      foreground.release("decode");
      await settle();
      // Foreground work started before the forecast is allowed to finish normally.
      // Evict its already-prefetched finer bytes so restoring Full must schedule
      // a fresh speculative batch rather than succeeding from those cached bytes.
      for (const tile of foreground.local) {
        if (tile.startsWith("1:")) foreground.local.delete(tile);
      }
      const before = foreground.fetches.length;
      expect(
        pool.metrics.images.find((image) => image.id === "warm")!.visibleReady
      ).toBe(false);
      sources.get("warm")!.release("decode");
      await settle();
      expect(
        pool.metrics.images.find((image) => image.id === "warm")!.visibleReady
      ).toBe(true);
      expect(
        foreground.fetches
          .slice(before)
          .flatMap((call) => call.tiles)
          .some((tile) => tile.level === 1)
      ).toBe(true);
    } finally {
      pool.dispose();
    }
  });

  it("applies the independent warm budget to an already parked image", async () => {
    const { pool } = setup(undefined, () => 4 * MiB);
    try {
      const lease = pool.acquire(descriptor("old"));
      lease.stack.setView(view(), 512 ** 2);
      await settle();
      const retained = lease.stack.tile(2, 0, 0);
      lease.release();
      pool.prewarm(descriptor("old"), view(1024), 512 ** 2);
      await settle();
      expect(pool.metrics.images[0].budgetBytes).toBe(96 * MiB);
      const promoted = pool.acquire(descriptor("old"));
      expect(promoted.stack).toBe(lease.stack);
      expect(promoted.stack.tile(2, 0, 0)).toBe(retained);
      expect(promoted.stack.budgetBytes).toBe(4 * MiB);
    } finally {
      pool.dispose();
    }
  });

  it("aborts forecast metadata before opening a newly acquired foreground", async () => {
    const { pool, sources } = setup((source, id) => {
      if (id === "warm") source.hold.add("open");
    });
    try {
      pool.prewarm(descriptor("warm"), view(), 512 ** 2);
      await settle();
      const warm = sources.get("warm")!;
      pool.acquire(descriptor("foreground"));
      await settle();
      expect(warm.disposed).toBe(true);
      expect(warm.pending[0].signal.aborted).toBe(true);
      expect(pool.metrics.images.some((image) => image.id === "warm")).toBe(
        false
      );
    } finally {
      pool.dispose();
    }
  });
  it("does not abort an unfinished foreground fetch when a forecast is queued", async () => {
    const { pool, sources } = setup((source, id) => {
      if (id === "active") source.hold.add("fetch");
    });
    try {
      const active = pool.acquire(descriptor("active"));
      active.stack.setView(view(), 512 ** 2);
      await settle();
      const source = sources.get("active")!;
      const ongoing = source.fetches.map((request) => request.signal);
      expect(ongoing.length).toBeGreaterThan(0);
      const pauses = source.pauses;
      pool.prewarm(descriptor("warm"), view(), 512 ** 2);
      await settle();
      expect(source.pauses).toBe(pauses);
      expect(ongoing.every((signal) => !signal.aborted)).toBe(true);
      expect(sources.has("warm")).toBe(false);
      source.release("fetch");
      await settle();
      expect(active.stack.metrics.visibleReady).toBe(true);
      expect(sources.has("warm")).toBe(true);
    } finally {
      pool.dispose();
    }
  });
});

describe("forecast compressed transfer budgets", () => {
  it("shares a group allowance across hovers, caps image count and removes the cap on foreground promotion", async () => {
    const { pool, sources } = setup();
    try {
      const config = { imageBytes: 100, groupBytes: 150, maxImages: 2 };
      pool.setPrefetchGroup("origin", config);
      pool.prewarm(descriptor("a"), view(), 512 ** 2);
      await settle();
      const a = sources.get("a")!;
      reserveImagePrefetchBytes(a.prefetchBudget, 90);
      pool.prewarm(descriptor("b"), view(), 512 ** 2);
      await settle();
      const b = sources.get("b")!;
      expect(b.prefetchBudget?.remainingBytes).toBe(100);
      expect(b.prefetchBudget?.group?.remainingBytes).toBe(60);
      expect(() => reserveImagePrefetchBytes(b.prefetchBudget, 61)).toThrow();
      pool.setPrefetchGroup("origin", config);
      expect(b.prefetchBudget?.group?.remainingBytes).toBe(60);
      pool.prewarm(descriptor("c"), view(), 512 ** 2);
      expect(sources.has("c")).toBe(false);
      const foreground = pool.acquire(descriptor("b"));
      expect(b.prefetchBudget).toBeUndefined();
      expect(b.priority).toBe("high");
      foreground.release();
      pool.setPrefetchGroup("new-origin", config);
      pool.prewarm(descriptor("c"), view(), 512 ** 2);
      await settle();
      expect(sources.get("c")?.prefetchBudget?.group?.remainingBytes).toBe(150);
    } finally {
      pool.dispose();
    }
  });
});

describe("serial forecast groups", () => {
  it("finishes one forecast before opening the next, deduplicates and cancels the tail", async () => {
    const { pool, sources } = setup((source) => source.hold.add("decode"));
    try {
      pool.setPrefetchGroup("route", { maxImages: 3 });
      const forecast = (id: string) => ({
        source: descriptor(id),
        view: view(),
        viewportPixels: 512 ** 2,
      });
      const cancel = pool.prewarmGroup([
        forecast("a"),
        forecast("a"),
        forecast("b"),
        forecast("c"),
      ]);
      await settle();
      expect([...sources.keys()]).toEqual(["a"]);
      sources.get("a")!.release("decode");
      await settle();
      expect([...sources.keys()]).toEqual(["a", "b"]);
      cancel();
      sources.get("b")!.release("decode");
      await settle();
      expect(sources.has("c")).toBe(false);
    } finally {
      pool.dispose();
    }
  });
});

describe("viewport working-set retention", () => {
  it("retains more than eight contributing images and reuses their stacks", async () => {
    const { pool, sources } = setup();
    const retention = pool.retainWorkingSet({
      maxImages: 12,
      maxParkedBytes: 64 * MiB,
    });
    try {
      let first;
      for (let i = 0; i < 12; i++) {
        const item = pool.acquire(descriptor(String(i)));
        await item.stack.ready;
        first ??= item.stack;
        item.release();
      }
      expect(pool.metrics.images).toHaveLength(12);
      expect(pool.metrics.maxImages).toBe(12);
      expect([...sources.values()].every((source) => !source.disposed)).toBe(
        true
      );
      const again = pool.acquire(descriptor("0"));
      expect(again.stack).toBe(first);
      again.release();
    } finally {
      retention.release();
      pool.dispose();
    }
  });

  it("applies the parked byte cap while protecting every active lease", async () => {
    const { pool, sources } = setup((source) => {
      source.compressedBytes = 2 * MiB;
    });
    const retention = pool.retainWorkingSet({
      maxImages: 12,
      maxParkedBytes: 3 * MiB,
    });
    try {
      const active = pool.acquire(descriptor("active"));
      await active.stack.ready;
      for (const id of ["old", "new"]) {
        const parked = pool.acquire(descriptor(id));
        await parked.stack.ready;
        parked.release();
      }
      expect(sources.get("old")!.disposed).toBe(true);
      expect(sources.get("new")!.disposed).toBe(false);
      expect(sources.get("active")!.disposed).toBe(false);
      expect(
        pool.metrics.images.find((entry) => entry.id === "active")?.active
      ).toBe(true);
      retention.update({ maxImages: 0, maxParkedBytes: 0 });
      expect(sources.get("new")!.disposed).toBe(true);
      expect(sources.get("active")!.disposed).toBe(false);
      active.release();
      expect(sources.get("active")!.disposed).toBe(true);
    } finally {
      retention.release();
      pool.dispose();
    }
  });

  it("restores the baseline image limit on release and ignores later updates to that reservation", async () => {
    const { pool } = setup();
    const retention = pool.retainWorkingSet({
      maxImages: 10,
      maxParkedBytes: 64 * MiB,
    });
    try {
      retention.update({ maxImages: 12, maxParkedBytes: 64 * MiB });
      for (let i = 0; i < 12; i++) {
        const item = pool.acquire(descriptor(String(i)));
        await item.stack.ready;
        item.release();
      }
      expect(pool.metrics.images).toHaveLength(12);
      retention.release();
      expect(pool.metrics.maxImages).toBe(8);
      expect(pool.metrics.images).toHaveLength(8);
      retention.update({ maxImages: 20, maxParkedBytes: 128 * MiB });
      retention.release();
      expect(pool.metrics.maxImages).toBe(8);
    } finally {
      pool.dispose();
    }
  });
});

it("reopens failed unowned metadata with the same source URL while preserving active owners", async () => {
  const sources: ControlledSource[] = [];
  const pool = new ImageLevelStackPool({
    createSource: (input) => {
      const source = new ControlledSource(input.url);
      if (!sources.length)
        source.open = async () => {
          throw Error("temporary metadata failure");
        };
      sources.push(source);
      return source;
    },
  });
  try {
    const source = descriptor("recover");
    const first = pool.acquire(source);
    await first.stack.ready.catch(() => undefined);
    await settle();
    expect(first.stack.error).toBe("temporary metadata failure");
    const shared = pool.acquire(source);
    expect(shared.stack).toBe(first.stack);
    expect(sources).toHaveLength(1);
    shared.release();
    first.release();
    const next = pool.acquire(source);
    expect(next.stack).not.toBe(first.stack);
    expect(sources[0].disposed).toBe(true);
    expect(sources[1].url).toBe(source.url);
    await next.stack.ready;
    expect(next.stack.pyramid).toEqual(pyramid);
    next.release();
  } finally {
    pool.dispose();
  }
});

it("retries parked tile failures without discarding pixels or changing a live owner", async () => {
  const sources: ControlledSource[] = [];
  const pool = new ImageLevelStackPool({
    createSource: (input) => {
      const source = new ControlledSource(input.url);
      sources.push(source);
      return source;
    },
  });
  try {
    const source = descriptor("tile-retry");
    const first = pool.acquire(source);
    await first.stack.ready;
    first.stack.setView(view());
    await settle();
    const bitmap = first.stack.tile(2, 0, 0);
    expect(bitmap).toBeDefined();
    first.stack.error = "temporary tile failure";
    const shared = pool.acquire(source);
    expect(shared.stack.error).toBe("temporary tile failure");
    first.release();
    shared.release();
    // Parking enforces its budget; retain a floor tile that survived that trim.
    const parkedBitmap = first.stack.tile(3, 0, 0);
    expect(parkedBitmap).toBeDefined();
    const retry = pool.acquire(source);
    expect(retry.stack).toBe(first.stack);
    expect(retry.stack.error).toBeNull();
    expect(retry.stack.tile(3, 0, 0)).toBe(parkedBitmap);
    expect(sources).toHaveLength(1);
    expect(sources[0].disposed).toBe(false);
    retry.release();
  } finally {
    pool.dispose();
  }
});
