import { describe, expect, it, vi } from "vitest";
import {
  ImageLevelStackPool,
  type ImageTileSource,
  type ImagePyramid,
  type ImagePrefetchConfig,
} from "@carma-commons/image-pyramid";
import type { DevicePixels, Ratio } from "@carma-units";
import { reserveImagePrefetchBytes } from "../../../../../../commons/image-pyramid/src/lib/runtime/image-tile-source";
import { prewarmNavigationGroup } from "./navigation-prefetch";

const fixture = () => {
  const listeners = new Set<() => void>();
  const images = [
    {
      id: "current",
      active: true,
      visibleReady: false,
      error: null as string | null,
    },
    {
      id: "cached-candidate",
      active: false,
      visibleReady: true,
      error: null as string | null,
    },
  ];
  const release = vi.fn();
  const unsubscribe = vi.fn();
  const prewarmGroup = vi.fn(() => release);
  const diagnostics = vi.fn(() =>
    images.map((image) => ({
      ...image,
      metrics: { visibleReady: image.visibleReady },
    }))
  );
  const pool = {
    get metrics() {
      return { images };
    },
    diagnostics,
    peek: vi.fn(),
    prewarmGroup,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        unsubscribe();
      };
    },
  } as unknown as ImageLevelStackPool;
  const forecasts = [
    { source: { id: "cached-candidate" }, view: {}, viewportPixels: 100 },
  ] as Parameters<ImageLevelStackPool["prewarmGroup"]>[0];
  return {
    pool,
    images,
    forecasts,
    prewarmGroup,
    diagnostics,
    release,
    unsubscribe,
    emit: () => listeners.forEach((listener) => listener()),
    listeners,
  };
};
const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));

describe("navigation prefetch foreground barrier", () => {
  it("does not apply a cached coarse-ready candidate until foreground demand is ready", async () => {
    const f = fixture();
    const cancel = prewarmNavigationGroup(f.pool, f.forecasts);
    expect(f.prewarmGroup).not.toHaveBeenCalled();
    await flush();
    expect(f.prewarmGroup).not.toHaveBeenCalled();
    f.images[0].visibleReady = true;
    f.emit();
    f.emit();
    f.emit();
    expect(f.prewarmGroup).not.toHaveBeenCalled();
    await flush();
    expect(f.prewarmGroup).toHaveBeenCalledOnce();
    expect(f.prewarmGroup).toHaveBeenCalledWith(f.forecasts);
    expect(f.unsubscribe).not.toHaveBeenCalled();
    f.emit();
    await flush();
    expect(f.prewarmGroup).toHaveBeenCalledOnce();
    cancel();
    cancel();
    expect(f.release).toHaveBeenCalledOnce();
  });

  it("uses the cheap metrics fast path and coalesces synchronous pool notifications", async () => {
    const f = fixture();
    f.images[0].visibleReady = true;
    const cancel = prewarmNavigationGroup(f.pool, f.forecasts);
    f.emit();
    f.emit();
    await flush();
    expect(f.diagnostics).not.toHaveBeenCalled();
    expect(f.prewarmGroup).toHaveBeenCalledOnce();
    cancel();
  });

  it("rechecks the caller readiness gate on pool events without polling", async () => {
    const f = fixture();
    f.images[0].visibleReady = true;
    let ready = false;
    const cancel = prewarmNavigationGroup(f.pool, f.forecasts, () => ready);
    await flush();
    expect(f.prewarmGroup).not.toHaveBeenCalled();
    ready = true;
    f.emit();
    await flush();
    expect(f.prewarmGroup).toHaveBeenCalledOnce();
    cancel();
  });

  it("lets errored foreground images pass but still waits for every healthy foreground demand", async () => {
    const f = fixture();
    f.images[0].error = "failed tile";
    f.images.push({
      id: "drape",
      active: true,
      visibleReady: false,
      error: null,
    });
    const cancel = prewarmNavigationGroup(f.pool, f.forecasts);
    await flush();
    expect(f.prewarmGroup).not.toHaveBeenCalled();
    f.images[2].visibleReady = true;
    f.emit();
    await flush();
    expect(f.prewarmGroup).toHaveBeenCalledOnce();
    cancel();
  });

  it("cancels pending microtasks and unsubscribes without opening any forecast", async () => {
    const f = fixture();
    f.images[0].visibleReady = true;
    const cancel = prewarmNavigationGroup(f.pool, f.forecasts);
    cancel();
    cancel();
    f.emit();
    await flush();
    expect(f.prewarmGroup).not.toHaveBeenCalled();
    expect(f.unsubscribe).toHaveBeenCalledOnce();
    expect(f.listeners.size).toBe(0);
    expect(f.release).not.toHaveBeenCalled();
  });

  it("cancels a blocked wait and ignores a readiness notification already queued", async () => {
    const f = fixture();
    const cancel = prewarmNavigationGroup(f.pool, f.forecasts);
    await flush();
    f.images[0].visibleReady = true;
    f.emit();
    cancel();
    await flush();
    expect(f.prewarmGroup).not.toHaveBeenCalled();
    expect(f.unsubscribe).toHaveBeenCalledOnce();
  });
  it("configures a newly notified stack before group listeners and does not recurse on configure emissions", async () => {
    const f = fixture();
    f.images[0].visibleReady = true;
    const configure = vi.fn(() => f.emit());
    const stack = { configure, metrics: { visibleReady: false } };
    const peek = vi.mocked(f.pool.peek);
    const cancel = prewarmNavigationGroup(f.pool, [
      { ...f.forecasts[0], viewportPixels: 2 * 1024 * 1024 },
    ]);
    await flush();
    peek.mockReturnValue(stack as ReturnType<ImageLevelStackPool["peek"]>);
    const observer = vi.fn(() =>
      expect(configure).toHaveBeenCalledWith({
        parkedBudgetBytes: 32 * 1024 * 1024,
      })
    );
    f.listeners.add(observer);
    f.emit();
    f.emit();
    expect(configure).toHaveBeenCalledOnce();
    cancel();
    f.emit();
    expect(configure).toHaveBeenCalledOnce();
  });

  it.each(["single-tile", "dense-grid", "prior-full"] as const)(
    "retains actual %s display tile bytes over serial handover and reserves finite forecast bytes",
    async (shape) => {
      const native = {
        width: (shape !== "single-tile" ? 5000 : 2048) as DevicePixels,
        height: (shape !== "single-tile" ? 3000 : 2048) as DevicePixels,
      };
      const pyramid: ImagePyramid = {
        native,
        levels: (shape !== "single-tile" ? [0, 1, 2] : [0, 1]).map((level) => {
          const width = Math.ceil(native.width / 2 ** level) as DevicePixels;
          const height = Math.ceil(native.height / 2 ** level) as DevicePixels;
          const tileWidth = (
            shape !== "single-tile" ? 1024 : width
          ) as DevicePixels;
          const tileHeight = (
            shape !== "single-tile" ? 1024 : height
          ) as DevicePixels;
          return {
            level,
            width,
            height,
            tileWidth,
            tileHeight,
            cols: Math.ceil(width / tileWidth),
            rows: Math.ceil(height / tileHeight),
          };
        }),
      };
      const reserved: number[] = [];
      const pool = new ImageLevelStackPool({
        maxImages: 8,
        stackOptions: {
          idlePrefetch: "none",
          ringTiles: shape === "prior-full" ? 1 : 0,
          decodeFinerAt: Infinity,
          minLevelEdge: 1 as DevicePixels,
          zoomOutFactor: 1,
          foveaRadius: shape === "prior-full" ? 0.1 : null,
        },
        createSource: (source) => {
          const local = new Set<number>();
          const fake: ImageTileSource = {
            kind: "avif",
            url: source.url,
            compressedBytes: 0,
            requestCount: 0,
            open: async () => pyramid,
            hasBytes: (tile) => local.has(tile.level),
            fetch: async (tiles, signal) => {
              signal.throwIfAborted();
              const bytes = tiles.length * 100;
              reserveImagePrefetchBytes(fake.prefetchBudget, bytes);
              reserved.push(bytes);
              tiles.forEach((tile) => local.add(tile.level));
            },
            decode: async (tile, signal) => {
              signal.throwIfAborted();
              const level = pyramid.levels.find(
                (level) => level.level === tile.level
              )!;
              return {
                width: level.tileWidth,
                height: level.tileHeight,
                close: vi.fn(),
              } as unknown as ImageBitmap;
            },
            pause: () => {},
            dispose: () => {},
          };
          return fake;
        },
      });
      const limits: ImagePrefetchConfig = {
        imageBytes: Number.MAX_SAFE_INTEGER,
        groupBytes: Number.MAX_SAFE_INTEGER,
        maxImages: 4,
      };
      pool.setPrefetchGroup("finite-display", limits);
      const forecasts = ["a", "b"].map((id) => ({
        source: {
          id,
          url: `https://example.invalid/${id}.avif`,
          kind: "avif" as const,
          nativeSize: native,
        },
        view: {
          visible:
            shape === "single-tile"
              ? { x: 0 as DevicePixels, y: 0 as DevicePixels, ...native }
              : {
                  x: 1000 as DevicePixels,
                  y: 1000 as DevicePixels,
                  width: 2000 as DevicePixels,
                  height: 1200 as DevicePixels,
                },
          density: (shape === "single-tile" ? 1 : 0.75) as Ratio,
        },
        viewportPixels: shape !== "single-tile" ? 1440000 : 2048 * 2048,
      }));
      let previousForeground:
        | ReturnType<ImageLevelStackPool["acquire"]>
        | undefined;
      if (shape === "prior-full") {
        previousForeground = pool.acquire(forecasts[0].source);
        previousForeground.stack.setView(
          forecasts[0].view,
          forecasts[0].viewportPixels
        );
        for (let i = 0; i < 800; i++) await Promise.resolve();
        expect(previousForeground.stack.metrics.visibleReady).toBe(true);
        expect(
          previousForeground.stack.plan!.wants.some(
            (want) => want.role === "target-periphery"
          )
        ).toBe(true);
        expect(
          previousForeground.stack.plan!.wants.some(
            (want) =>
              want.role === "target-ring" &&
              previousForeground!.stack.isResident(
                want.level,
                want.col,
                want.row
              )
          )
        ).toBe(true);
      }
      const cancel = prewarmNavigationGroup(pool, forecasts);
      previousForeground?.release();
      try {
        for (let i = 0; i < 800; i++) await Promise.resolve();
        expect(reserved.length).toBeGreaterThan(0);
        for (const forecast of forecasts) {
          const stack = pool.peek(forecast.source)!;
          expect(stack.metrics.decodedBytes).toBeGreaterThan(8 * 1024 * 1024);
          expect(stack.metrics.visibleReady).toBe(true);
          if (shape === "prior-full" && forecast === forecasts[0]) {
            const essential = stack
              .plan!.wants.filter(
                (want) =>
                  want.decode &&
                  ["floor", "underlay", "target", "target-periphery"].includes(
                    want.role
                  )
              )
              .reduce((sum, want) => {
                const bitmap = stack.tile(want.level, want.col, want.row);
                return sum + (bitmap ? bitmap.width * bitmap.height * 4 : 0);
              }, 0);
            expect(stack.metrics.decodedBytes).toBeGreaterThan(essential);
          }
          if (shape !== "single-tile") {
            expect(stack.metrics.decodedBytes).toBeGreaterThan(1440000 * 16);
            for (const want of stack.plan!.wants.filter(
              (want) =>
                want.decode &&
                ["floor", "underlay", "target", "target-periphery"].includes(
                  want.role
                )
            ))
              expect(stack.isResident(want.level, want.col, want.row)).toBe(
                true
              );
          }
        }
        expect(
          pool.metrics.images.every(
            (image) => !image.active && !image.prewarming
          )
        ).toBe(true);
        const group = { remainingBytes: Number.MAX_SAFE_INTEGER };
        const budget = { remainingBytes: Number.MAX_SAFE_INTEGER, group };
        reserveImagePrefetchBytes(budget, 100);
        expect(budget.remainingBytes).toBe(Number.MAX_SAFE_INTEGER - 100);
        expect(() =>
          reserveImagePrefetchBytes({ remainingBytes: Infinity }, 100)
        ).toThrow();
      } finally {
        cancel();
        pool.dispose();
      }
    }
  );
});
