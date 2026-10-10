import type { DevicePixels, Ratio } from "@carma-units";
import type { ImageView } from "../core/image-level-plan";
import {
  ImageLevelStackPool,
  imagePyramidSourceKey,
  type ImagePyramidSource,
} from "./image-level-stack-pool";
import {
  reserveImagePrefetchBytes,
  ImagePrefetchBudgetExceeded,
  type ImagePrefetchBudget,
} from "./image-tile-source";
import type {
  ImagePyramid,
  ImageTileDecodeContext,
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
  compressedTrims: number[] = [];
  decoderWorkingBytes = 0;
  decoderBudgets: number[] = [];
  decoderTrims: number[] = [];
  configureDecoderWorkingBudget(bytes: number) {
    this.decoderBudgets.push(bytes);
    this.trimDecoderWorkingTo(bytes);
  }
  trimDecoderWorkingTo(bytes: number) {
    this.decoderTrims.push(bytes);
    if (!this.activeDecodes)
      this.decoderWorkingBytes = Math.min(
        this.decoderWorkingBytes,
        Math.max(0, bytes)
      );
  }
  trimCompressedTo(bytes: number) {
    this.compressedTrims.push(bytes);
    this.compressedBytes = Math.min(this.compressedBytes, Math.max(0, bytes));
  }
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
  decodedBudget?: () => number,
  options: NonNullable<
    ConstructorParameters<typeof ImageLevelStackPool>[0]
  > = {}
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
    ...options,
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
  it("keeps the completed L3 decoder when pool admission restricts a new L1 view to visible work", async () => {
    const pauses: ({ retainDecoders?: boolean } | undefined)[] = [];
    const decoded: { level: number; continued: boolean }[] = [];
    const { pool, sources } = setup(
      (source) => {
        source.open = async () => ({
          native: { width: 1024 as DevicePixels, height: 1024 as DevicePixels },
          levels: [1, 2, 3, 4].map((level) => {
            const edge = (1024 / 2 ** level) as DevicePixels;
            return {
              level,
              width: edge,
              height: edge,
              tileWidth: edge,
              tileHeight: edge,
              cols: 1,
              rows: 1,
            };
          }),
        });
        const decode = source.decode.bind(source);
        source.decode = async (
          tile: ImageTileRef,
          signal: AbortSignal,
          context?: ImageTileDecodeContext
        ) => {
          decoded.push({
            level: tile.level,
            continued: source.decoderWorkingBytes > 0,
          });
          const bitmap = await decode(tile, signal);
          source.decoderWorkingBytes = context?.retainProgressive
            ? 16 * MiB
            : 0;
          return bitmap;
        };
        source.pause = (options?: { retainDecoders?: boolean }) => {
          source.pauses++;
          pauses.push(options);
          if (!options?.retainDecoders) source.trimDecoderWorkingTo(0);
        };
      },
      undefined,
      {
        maxDecodedBytes: 40 * MiB,
        stackOptions: {
          idlePrefetch: "none",
          prefetchFiner: false,
          minLevelEdge: 0 as DevicePixels,
          ringTiles: 0,
          foveaRadius: null,
          maxDecodes: 1,
          decodedBudget: () => 40 * MiB,
        },
      }
    );
    const lease = pool.acquire(descriptor("progressive"));
    const source = sources.get("progressive")!;
    const current = {
      ...view(),
      visible: {
        ...view().visible,
        width: 512 as DevicePixels,
        height: 512 as DevicePixels,
      },
    };
    try {
      await lease.stack.ready;
      lease.stack.setView({ ...current, density: 0.125 as Ratio }, 64 ** 2);
      await settle();
      expect(lease.stack.plan?.target).toBe(3);
      expect(lease.stack.visibleReady).toBe(true);
      expect(source.decoderWorkingBytes).toBe(16 * MiB);
      source.hold.add("fetch");
      lease.stack.setView({ ...current, density: 0.5 as Ratio }, 256 ** 2);
      await settle();
      expect(lease.stack.visibleReady).toBe(false);
      expect(pauses.at(-1)).toEqual({ retainDecoders: true });
      expect(source.decoderWorkingBytes).toBe(16 * MiB);
      source.release("fetch");
      await settle();
      expect(decoded.find((entry) => entry.level === 1)).toEqual({
        level: 1,
        continued: true,
      });
      expect(decoded.filter((entry) => entry.level === 3)).toHaveLength(1);
      expect(lease.stack.visibleReady).toBe(true);
      expect(
        lease.stack.metrics.decodedBytes + source.decoderWorkingBytes
      ).toBeLessThanOrEqual(40 * MiB);
    } finally {
      lease.release();
      pool.dispose();
    }
  });

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
    first.stack.setView(view(), 512 ** 2);
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

describe("shared thumbnail and viewport demands", () => {
  it("promotes a coarse query to the same source and resident floor", async () => {
    const { pool, sources } = setup();
    const input = descriptor("thumbnail-first");
    const thumbnail = pool.acquireDemand(input, {
      priority: "low",
      coarseOnly: true,
    });
    thumbnail.setView(view(), 256 ** 2);
    try {
      const stack = await thumbnail.ready;
      await settle();
      expect(thumbnail.visibleReady).toBe(true);
      expect(sources.get(input.id)!.priority).toBe("low");
      const floor = thumbnail.plan!.floor;
      const bitmap = stack.tile(floor, 0, 0);
      const preview = pool.acquire(input);
      preview.stack.setView(view(512), 512 ** 2);
      const primary = preview.stack.plan;
      expect(preview.stack).toBe(stack);
      expect(sources.get(input.id)!.openCalls).toBe(1);
      expect(stack.tile(floor, 0, 0)).toBe(bitmap);
      thumbnail.setView(view(0), 256 ** 2);
      expect(stack.plan).toBe(primary);
      thumbnail.release();
      expect(stack.plan).toBe(primary);
      expect(sources.get(input.id)!.priority).toBe("high");
      await settle();
      expect(stack.visibleReady).toBe(true);
      preview.release();
    } finally {
      thumbnail.release();
      pool.dispose();
    }
  });

  it("defers another low source but shares the unfinished active source immediately", async () => {
    const { pool, sources } = setup((source, id) => {
      if (id === "active") source.hold.add("fetch");
    });
    const active = pool.acquire(descriptor("active"));
    await active.stack.ready;
    active.stack.setView(view(), 512 ** 2);
    const primary = active.stack.plan;
    const same = pool.acquireDemand(descriptor("active"), {
      priority: "low",
      coarseOnly: true,
    });
    same.setView(view(), 256 ** 2);
    const other = pool.acquireDemand(descriptor("other"), {
      priority: "low",
      coarseOnly: true,
    });
    other.setView(view(), 256 ** 2);
    try {
      expect(await same.ready).toBe(active.stack);
      expect(pool.hasForeground(descriptor("active"))).toBe(true);
      expect(pool.hasForeground(descriptor("other"))).toBe(false);
      expect(active.stack.plan).toBe(primary);
      expect(sources.has("other")).toBe(false);
      sources.get("active")!.release("fetch");
      await settle();
      await other.ready;
      expect(sources.has("other")).toBe(true);
      expect(sources.get("active")!.openCalls).toBe(1);
    } finally {
      same.release();
      other.release();
      active.release();
      pool.dispose();
    }
  });

  it("cancels a queued low request without ever creating its source", async () => {
    const { pool, sources } = setup((source) => source.hold.add("fetch"));
    const active = pool.acquire(descriptor("active"));
    await active.stack.ready;
    active.stack.setView(view(), 512 ** 2);
    const queued = pool.acquireDemand(descriptor("cancelled"), {
      priority: "low",
      coarseOnly: true,
    });
    queued.setView(view(), 256 ** 2);
    queued.release();
    await expect(queued.ready).rejects.toMatchObject({ name: "AbortError" });
    expect(sources.has("cancelled")).toBe(false);
    active.release();
    pool.dispose();
  });

  it("keeps independent viewport targets and does not abort one on another lease's release", async () => {
    const { pool, sources } = setup();
    const input = descriptor("two-views");
    const first = pool.acquireDemand(input);
    const second = pool.acquireDemand(input);
    first.setView(view(0), 512 ** 2);
    second.setView(view(1024), 512 ** 2);
    try {
      const stack = await first.ready;
      expect(await second.ready).toBe(stack);
      await settle();
      expect(first.visibleReady).toBe(true);
      expect(second.visibleReady).toBe(true);
      const { scale, ...plan } = second.plan!;
      const pauses = sources.get(input.id)!.pauses;
      first.release();
      const { scale: nextScale, ...nextPlan } = second.plan!;
      expect(nextPlan).toEqual(plan);
      // Replanning recreates the scale closure, but its values must stay fixed.
      for (const level of pyramid.levels)
        expect(nextScale(level.level)).toBe(scale(level.level));
      expect(second.visibleReady).toBe(true);
      expect(sources.get(input.id)!.pauses).toBe(pauses);
      expect(sources.get(input.id)!.openCalls).toBe(1);
    } finally {
      first.release();
      second.release();
      pool.dispose();
    }
  });

  it("retains source metadata while global memory pressure removes all parked pixels", async () => {
    const { pool, sources } = setup(undefined, undefined, {
      maxImages: 1,
      maxDecodedBytes: 0,
      maxCompressedBytes: 0,
    });
    const first = pool.acquire(descriptor("first"));
    await first.stack.ready;
    first.stack.setView(view(), 512 ** 2);
    await settle();
    expect(first.stack.visibleReady).toBe(true);
    first.release();
    expect(first.stack.metrics.decodedBytes).toBe(0);
    expect(sources.get("first")!.disposed).toBe(false);
    const second = pool.acquire(descriptor("second"));
    await second.stack.ready;
    second.release();
    const reused = pool.acquire(descriptor("first"));
    expect(reused.stack).toBe(first.stack);
    expect(sources.get("first")!.openCalls).toBe(1);
    reused.release();
    pool.dispose();
  });

  it("trims parked compressed detail independently of decoded pixels", async () => {
    const { pool, sources } = setup(undefined, undefined, {
      maxDecodedBytes: 64 * MiB,
      maxCompressedBytes: 32,
    });
    const preview = pool.acquire(descriptor("compressed"));
    await preview.stack.ready;
    preview.stack.setView(view(), 512 ** 2);
    await settle();
    const source = sources.get("compressed")!;
    source.compressedBytes = 128;
    const pixels = preview.stack.metrics.decodedBytes;
    preview.release();
    expect(source.compressedTrims).toEqual([32]);
    expect(pool.metrics.compressedBytes).toBe(32);
    expect(preview.stack.metrics.decodedBytes).toBe(pixels);
    expect(source.disposed).toBe(false);
    pool.dispose();
  });

  it("releases unused bootstrap residency only after detail trimming cannot meet RAM retention", async () => {
    const { pool, sources } = setup(
      (source) => {
        source.trimCompressedTo = (bytes) => {
          source.compressedTrims.push(bytes);
          // Model a retained native prefix that cannot be trimmed partially.
          source.compressedBytes = Math.min(source.compressedBytes, 64);
        };
      },
      undefined,
      { maxDecodedBytes: 64 * MiB, maxCompressedBytes: 128 }
    );
    const first = pool.acquire(descriptor("old-bootstrap"));
    await first.stack.ready;
    first.stack.setView(view(), 512 ** 2);
    await settle();
    const old = sources.get("old-bootstrap")!;
    old.compressedBytes = 96;
    first.release();
    expect(old.disposed).toBe(false);
    const second = pool.acquireDemand(descriptor("held-bootstrap"), {
      priority: "low",
      coarseOnly: true,
    });
    second.setView(view(), 256 ** 2);
    await second.ready;
    const held = sources.get("held-bootstrap")!;
    held.compressedBytes = 96;
    const retention = pool.retainWorkingSet({
      maxImages: 2,
      maxParkedBytes: 64 * MiB,
    });
    await settle();
    expect(old.compressedTrims.length).toBeGreaterThan(0);
    expect(old.disposed).toBe(true);
    expect(first.stack.metrics.decodedBytes).toBe(0);
    expect(held.disposed).toBe(false);
    expect(pool.peek(descriptor("old-bootstrap"))).toBeUndefined();
    expect(pool.metrics.compressedBytes).toBe(96);
    retention.release();
    second.release();
    pool.dispose();
  });

  it("applies a query allowance before metadata opening and fetches without decoding", async () => {
    const budget = { remainingBytes: 64 };
    let openingBudget: ImagePrefetchBudget | undefined;
    const { pool, sources } = setup((source) => {
      const open = source.open.bind(source);
      source.open = async (signal) => {
        openingBudget = source.prefetchBudget;
        reserveImagePrefetchBytes(source.prefetchBudget, 8);
        return open(signal);
      };
      const fetch = source.fetch.bind(source);
      source.fetch = async (tiles, signal, priority) => {
        reserveImagePrefetchBytes(source.prefetchBudget, 4 * tiles.length);
        return fetch(tiles, signal, priority);
      };
    });
    const query = pool.acquireDemand(descriptor("bytes-only"), {
      priority: "low",
      decode: false,
      prefetchBudget: budget,
    });
    query.setView(view(), 512 ** 2);
    try {
      await query.ready;
      await settle();
      const source = sources.get("bytes-only")!;
      expect(openingBudget).toBe(budget);
      expect(source.prefetchBudget).toBe(budget);
      expect(budget.remainingBytes).toBeLessThan(56);
      expect(source.fetches.length).toBeGreaterThan(0);
      expect(source.decodes).toHaveLength(0);
      expect(query.visibleReady).toBe(true);
    } finally {
      query.release();
      pool.dispose();
    }
  });

  it("does not attach a speculative allowance to an existing foreground source", async () => {
    const { pool } = setup();
    const input = descriptor("visible-unlimited");
    const active = pool.acquire(input);
    await active.stack.ready;
    active.stack.setView(view(), 512 ** 2);
    const primary = active.stack.plan;
    const budget = { remainingBytes: 0 };
    const query = pool.acquireDemand(input, {
      priority: "low",
      decode: false,
      prefetchBudget: budget,
    });
    query.setView(view(), 512 ** 2);
    try {
      expect(await query.ready).toBe(active.stack);
      await settle();
      expect(active.stack.source.prefetchBudget).toBeUndefined();
      expect(active.stack.plan).toBe(primary);
      expect(active.stack.visibleReady).toBe(true);
      expect(budget.remainingBytes).toBe(0);
    } finally {
      query.release();
      active.release();
      pool.dispose();
    }
  });

  it("retries a budget-failed low metadata open when promoted, even while the low lease remains", async () => {
    const budget = { remainingBytes: 0 };
    const { pool, sources } = setup((source) => {
      const open = source.open.bind(source);
      source.open = async (signal) => {
        reserveImagePrefetchBytes(source.prefetchBudget, 8);
        return open(signal);
      };
    });
    const input = descriptor("metadata-promotion");
    const low = pool.acquireDemand(input, {
      priority: "low",
      decode: false,
      prefetchBudget: budget,
    });
    low.setView(view(), 512 ** 2);
    await expect(low.ready).rejects.toBeInstanceOf(ImagePrefetchBudgetExceeded);
    const failed = sources.get(input.id)!;
    const active = pool.acquire(input);
    try {
      await active.stack.ready;
      active.stack.setView(view(), 512 ** 2);
      await settle();
      expect(failed.disposed).toBe(true);
      expect(active.stack.source).not.toBe(failed);
      expect(active.stack.source.prefetchBudget).toBeUndefined();
      expect(active.stack.visibleReady).toBe(true);
      expect(low.visibleReady).toBe(true);
      expect(budget.remainingBytes).toBe(0);
    } finally {
      low.release();
      active.release();
      pool.dispose();
    }
  });

  it("lets an unbudgeted low thumbnail recover an exhausted metadata prefetch", async () => {
    const { pool, sources } = setup((source) => {
      const open = source.open.bind(source);
      source.open = async (signal) => {
        reserveImagePrefetchBytes(source.prefetchBudget, 8);
        return open(signal);
      };
    });
    const input = descriptor("thumbnail-recovery");
    const prefetch = pool.acquireDemand(input, {
      priority: "low",
      decode: false,
      prefetchBudget: { remainingBytes: 0 },
    });
    prefetch.setView(view(), 512 ** 2);
    await expect(prefetch.ready).rejects.toBeInstanceOf(
      ImagePrefetchBudgetExceeded
    );
    const failed = sources.get(input.id)!;
    const thumbnail = pool.acquireDemand(input, {
      priority: "low",
      coarseOnly: true,
    });
    thumbnail.setView(view(), 256 ** 2);
    try {
      const stack = await thumbnail.ready;
      await settle();
      expect(failed.disposed).toBe(true);
      expect(stack.source.prefetchBudget).toBeUndefined();
      expect(thumbnail.visibleReady).toBe(true);
    } finally {
      prefetch.release();
      thumbnail.release();
      pool.dispose();
    }
  });

  it("normalizes native routing aliases without separate obsolete representation pools", () => {
    const native = descriptor("native");
    expect(
      imagePyramidSourceKey({ ...native, url: native.url + "?pyramid=1#view" })
    ).toBe(imagePyramidSourceKey(native));
    const obsoleteCaller = {
      ...native,
      format: "native",
      fallbacks: [{ kind: "avif", url: "https://example.invalid/old.avif" }],
    };
    expect(imagePyramidSourceKey(obsoleteCaller)).toBe(
      imagePyramidSourceKey(native)
    );
    expect(imagePyramidSourceKey(descriptor("different"))).not.toBe(
      imagePyramidSourceKey(native)
    );
  });

  it("shares the decoded allowance with retained codec state without a tiny per-source cap", async () => {
    const { pool, sources } = setup(undefined, () => 128 * MiB, {
      maxDecodedBytes: 512 * MiB,
    });
    const active = pool.acquire(descriptor("codec-memory"));
    try {
      await active.stack.ready;
      active.stack.setView(view(), 512 ** 2);
      await settle();
      const source = sources.get("codec-memory")!;
      expect(source.decoderBudgets.at(-1)).toBeGreaterThan(32 * MiB);
      expect(source.decoderBudgets.at(-1)! + pool.metrics.decodedBytes).toBe(
        512 * MiB
      );
      source.decoderWorkingBytes = 64 * MiB;
      expect(pool.metrics.decoderWorkingBytes).toBe(64 * MiB);
      expect(pool.metrics.decodedBytes).toBe(active.stack.metrics.decodedBytes);
      expect(active.stack.visibleReady).toBe(true);
    } finally {
      active.release();
      pool.dispose();
    }
  });

  it("trims parked codec contexts before parked pixels when combined memory exceeds retention", async () => {
    const { pool, sources } = setup(undefined, () => 8 * MiB, {
      maxDecodedBytes: 16 * MiB,
    });
    const active = pool.acquire(descriptor("parked-codec"));
    try {
      await active.stack.ready;
      active.stack.setView(view(), 512 ** 2);
      await settle();
      const source = sources.get("parked-codec")!;
      const pixels = active.stack.metrics.decodedBytes;
      source.decoderWorkingBytes = 24 * MiB;
      active.release();
      expect(active.stack.metrics.decodedBytes).toBe(pixels);
      expect(source.decoderWorkingBytes + pixels).toBeLessThanOrEqual(16 * MiB);
      expect(source.decoderTrims.some((bytes) => bytes < 24 * MiB)).toBe(true);
    } finally {
      pool.dispose();
    }
  });
});
