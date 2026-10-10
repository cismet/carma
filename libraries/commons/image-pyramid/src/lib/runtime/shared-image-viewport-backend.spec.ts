import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DevicePixels, Ratio } from "@carma-units";
import type { NativePreviewWindow } from "../core/image-viewport-window";
import {
  ImageLevelStackPool,
  type ImagePyramidSource,
} from "./image-level-stack-pool";
import {
  ImageViewportPool,
  type ImageViewportSource,
} from "./image-viewport-pool";
import type {
  ImagePyramid,
  ImageTileRef,
  ImageTileSource,
} from "./image-tile-source";

const px = (n: number) => n as DevicePixels;
const pyramid: ImagePyramid = {
  native: { width: px(2048), height: px(1024) },
  levels: [
    {
      level: 1,
      width: px(512),
      height: px(256),
      tileWidth: px(256),
      tileHeight: px(256),
      cols: 2,
      rows: 1,
    },
    {
      level: 2,
      width: px(256),
      height: px(128),
      tileWidth: px(128),
      tileHeight: px(128),
      cols: 2,
      rows: 1,
    },
  ],
};
const descriptor: ImagePyramidSource = {
  id: "photo",
  kind: "avif",
  url: "https://images.invalid/photo.avif",
};
const source: ImageViewportSource = {
  ...descriptor,
  nativeSize: pyramid.native,
};
const whole = (width = 256): NativePreviewWindow => ({
  source: { x: px(0), y: px(0), ...pyramid.native },
  target: { width: px(width), height: px(width / 2) },
});
const key = (tile: ImageTileRef) => `${tile.level}:${tile.col}:${tile.row}`;
const settle = async () => {
  for (let i = 0; i < 120; i++) await Promise.resolve();
};
class Tiles implements ImageTileSource {
  readonly kind = "avif" as const;
  readonly url = descriptor.url;
  compressedBytes = 0;
  requestCount = 0;
  local = new Set<string>();
  fetchKeys: string[] = [];
  decoded: ImageBitmap[] = [];
  holdFine = false;
  fine: (() => void)[] = [];
  holdOpen?: Promise<void>;
  open = vi.fn(async () => {
    await this.holdOpen;
    return pyramid;
  });
  hasBytes(tile: ImageTileRef) {
    return this.local.has(key(tile));
  }
  async fetch(tiles: readonly ImageTileRef[], signal: AbortSignal) {
    signal.throwIfAborted();
    for (const tile of tiles) {
      this.fetchKeys.push(key(tile));
      this.local.add(key(tile));
    }
  }
  async decode(tile: ImageTileRef, signal: AbortSignal) {
    if (this.holdFine && tile.level === 1)
      await new Promise<void>((resolve) => this.fine.push(resolve));
    signal.throwIfAborted();
    const edge = tile.level === 1 ? 256 : 128;
    const bitmap = {
      width: edge,
      height: edge,
      close: vi.fn(),
    } as unknown as ImageBitmap;
    this.decoded.push(bitmap);
    return bitmap;
  }
  pause() {}
  dispose() {}
}
class Canvas {
  static instances: Canvas[] = [];
  context = {
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn((..._args: unknown[]) => undefined),
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "low",
  };
  constructor(public width: number, public height: number) {
    Canvas.instances.push(this);
  }
  getContext() {
    return this.context;
  }
  transferToImageBitmap() {
    return {
      width: this.width,
      height: this.height,
      close: vi.fn(),
    } as unknown as ImageBitmap;
  }
}
const cleanups: (() => void)[] = [];
function setup(tiles = new Tiles()) {
  const createSource = vi.fn(() => tiles);
  const shared = new ImageLevelStackPool({
    createSource,
    stackOptions: {
      minLevelEdge: px(128),
      ringTiles: 0,
      zoomOutFactor: 1,
      decodeFinerAt: Infinity,
      idlePrefetch: "none",
    },
  });
  const createWorker = vi.fn(() => {
    throw Error("Shared AVIF must not create a viewport worker");
  });
  const outputs = new ImageViewportPool({
    sharedStackPool: shared,
    resolvePyramidSource: () => descriptor,
    createWorker,
  });
  cleanups.push(() => {
    outputs.dispose();
    shared.dispose();
  });
  return { tiles, createSource, createWorker, shared, outputs };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("OffscreenCanvas", Canvas);
  Canvas.instances = [];
});
afterEach(() => {
  cleanups.splice(0).forEach((dispose) => dispose());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("shared viewport composition", () => {
  it("shares opens, fetches and decodes with the main stack while outputs retain independent plans", async () => {
    const { shared, outputs, tiles, createSource, createWorker } = setup();
    const main = shared.acquire(descriptor);
    await main.stack.ready;
    main.stack.setView(
      { visible: whole().source, density: 0.125 as Ratio },
      256 * 128
    );
    await settle();
    const mainPlan = main.stack.plan;
    const a = outputs.acquire(source);
    const b = outputs.acquire(source);
    a.setViewport(whole(128));
    b.setViewport({
      source: { x: px(512), y: px(256), width: px(1024), height: px(512) },
      target: { width: px(256), height: px(128) },
    });
    await settle();
    await vi.advanceTimersByTimeAsync(1);
    expect(createSource).toHaveBeenCalledTimes(1);
    expect(tiles.open).toHaveBeenCalledTimes(1);
    expect(new Set(tiles.fetchKeys).size).toBe(tiles.fetchKeys.length);
    expect(createWorker).not.toHaveBeenCalled();
    expect(main.stack.plan?.target).toBe(mainPlan?.target);
    expect(main.stack.plan?.visibleTarget).toEqual(mainPlan?.visibleTarget);
    expect(main.stack.plan?.layers).toEqual(mainPlan?.layers);
    expect(a.snapshot().bitmap).not.toBeNull();
    expect(b.snapshot().bitmap).not.toBeNull();
    expect(a.snapshot().bitmap).not.toBe(b.snapshot().bitmap);
    a.release();
    b.release();
    expect(
      tiles.decoded.every(
        (bitmap) => vi.mocked(bitmap.close).mock.calls.length === 0
      )
    ).toBe(true);
    main.release();
  });

  it("preserves sparse crop coordinates, independently rounded target edges and texture orientation", async () => {
    const { outputs } = setup();
    const handle = outputs.acquire({ ...source, flipForTexture: true });
    const window: NativePreviewWindow = {
      source: { x: px(512), y: px(256), width: px(1024), height: px(512) },
      target: { width: px(501), height: px(249) },
    };
    handle.setViewport(window);
    await settle();
    await vi.advanceTimersByTimeAsync(1);
    const result = handle.snapshot();
    expect(result.frame?.source).toEqual(window.source);
    expect(result.frame?.target).toEqual(window.target);
    const context = Canvas.instances.at(-1)!.context;
    expect(context.setTransform).toHaveBeenCalledWith(1, 0, 0, -1, 0, 249);
    expect(context.drawImage.mock.calls.length).toBeGreaterThan(0);
    expect(result.metrics.sourceBytes).toBe(0);
    expect(result.metrics.workerBytes).toBe(0);
  });

  it.each([false, true])(
    "draws the entire off-center rectangular ROI into a square output, flip=%s",
    async (flipForTexture) => {
      const { outputs } = setup();
      const handle = outputs.acquire({ ...source, flipForTexture });
      const window: NativePreviewWindow = {
        source: { x: px(256), y: px(128), width: px(1536), height: px(768) },
        target: { width: px(384), height: px(384) },
      };
      handle.setViewport(window);
      await settle();
      await vi.advanceTimersByTimeAsync(1);
      const result = handle.snapshot();
      expect(result.frame).toEqual(window);
      const context = Canvas.instances.at(-1)!.context;
      expect(context.clearRect).toHaveBeenCalledWith(0, 0, 384, 384);
      expect(context.setTransform).toHaveBeenCalledWith(
        1,
        0,
        0,
        flipForTexture ? -1 : 1,
        0,
        flipForTexture ? 384 : 0
      );
      const finest = context.drawImage.mock.calls.filter(
        ([bitmap]) => (bitmap as ImageBitmap).width === 256
      );
      // Both horizontal halves are present. Native pixels x=256..1792 and
      // y=128..896 map exactly onto all 384x384 output pixels, including the right edge.
      expect(finest.map((args) => args.slice(5))).toEqual([
        [-64, -64, 256, 512],
        [192, -64, 256, 512],
      ]);
    }
  );

  it("publishes a complete coarse view then coalesces finer updates to thirty frames per second", async () => {
    const tiles = new Tiles();
    tiles.holdFine = true;
    const { outputs } = setup(tiles);
    const handle = outputs.acquire(source);
    handle.setViewport(whole(512));
    await settle();
    await vi.advanceTimersByTimeAsync(1);
    const coarse = handle.snapshot();
    expect(coarse.bitmap).not.toBeNull();
    expect(coarse.input?.level).toBe(2);
    expect(coarse.loading).toBe(true);
    const count = Canvas.instances.length;
    tiles.holdFine = false;
    tiles.fine.splice(0).forEach((resolve) => resolve());
    await settle();
    await vi.advanceTimersByTimeAsync(20);
    expect(Canvas.instances.length).toBe(count);
    await vi.advanceTimersByTimeAsync(15);
    expect(Canvas.instances.length).toBe(count + 1);
    expect(handle.snapshot().input?.level).toBe(1);
    expect(handle.snapshot().loading).toBe(false);
  });

  it("does not publish a released request when metadata arrives late", async () => {
    const tiles = new Tiles();
    let ready!: () => void;
    tiles.holdOpen = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const { outputs, createWorker } = setup(tiles);
    const handle = outputs.acquire(source);
    handle.setViewport(whole());
    handle.release();
    ready();
    await settle();
    await vi.advanceTimersByTimeAsync(100);
    expect(Canvas.instances).toHaveLength(0);
    expect(createWorker).not.toHaveBeenCalled();
  });

  it("promotes an unchanged low-priority crop without creating a second image source", async () => {
    const { outputs, createSource, createWorker } = setup();
    const handle = outputs.acquire(source);
    handle.setViewport(whole(), undefined, { priority: "low" });
    await settle();
    handle.setViewport(whole(), undefined, { priority: "high" });
    await settle();
    await vi.advanceTimersByTimeAsync(1);
    expect(createSource).toHaveBeenCalledTimes(1);
    expect(createWorker).not.toHaveBeenCalled();
    expect(handle.snapshot().bitmap).not.toBeNull();
  });
});
