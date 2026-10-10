import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import type { DevicePixels, Ratio } from "@carma-units";
import { ImageLevelStackPool } from "../../../../../../commons/image-pyramid/src/lib/runtime/image-level-stack-pool";
import type { ImagePyramidSource } from "../../../../../../commons/image-pyramid/src/lib/runtime/image-level-stack-pool";
import type {
  ImagePyramid,
  ImageTileRef,
  ImageTileSource,
} from "../../../../../../commons/image-pyramid/src/lib/runtime/image-tile-source";
import {
  createSharedPreviewThumbnail,
  readSharedThumbnailBlob,
} from "./shared-preview-thumbnail";
import { nativePreviewSource } from "./native-preview-pool";
import type { ThumbnailSource } from "./preview-thumbnail-cache";

const state = vi.hoisted(() => ({
  pool: undefined as ImageLevelStackPool | undefined,
  stored: new Map<string, { revision: string; bytes: Uint8Array }>(),
}));
vi.mock("@carma-commons/image-pyramid", async () => {
  const pool = await import(
    "../../../../../../commons/image-pyramid/src/lib/runtime/image-level-stack-pool"
  );
  const draw = await import(
    "../../../../../../commons/image-pyramid/src/lib/runtime/draw-image-levels"
  );
  return {
    ...pool,
    ...draw,
    BoundedImageRangeCache: class {
      constructor(readonly url: string) {}
      async get(
        offset: number,
        length: number,
        revision: string,
        signal: AbortSignal
      ) {
        signal.throwIfAborted();
        const item = state.stored.get(this.url);
        return item?.revision === revision &&
          offset + length <= item.bytes.length
          ? item.bytes.slice(offset, offset + length)
          : undefined;
      }
      async put(offset: number, bytes: Uint8Array, revision: string) {
        expect(offset).toBe(0);
        state.stored.set(this.url, { revision, bytes: bytes.slice() });
      }
    },
  };
});
vi.mock("./native-preview-pool", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./native-preview-pool")>();
  return {
    ...actual,
    nativePixelPool: {
      acquireDemand: (
        ...args: Parameters<ImageLevelStackPool["acquireDemand"]>
      ) => state.pool!.acquireDemand(...args),
    },
  };
});
const px = (value: number) => value as DevicePixels;
const pyramid: ImagePyramid = {
  native: { width: px(2048), height: px(1024) },
  levels: [1, 2, 3].map((level) => ({
    level,
    width: px(2048 / 2 ** (level - 1)),
    height: px(1024 / 2 ** (level - 1)),
    tileWidth: px(512),
    tileHeight: px(Math.min(512, 1024 / 2 ** (level - 1))),
    cols: 4 / 2 ** (level - 1),
    rows: Math.max(1, 2 / 2 ** (level - 1)),
  })),
};
const bitmap = (width = 512, height = 256): ImageBitmap =>
  ({ width, height, close: vi.fn() } as unknown as ImageBitmap);
const tileKey = (tile: ImageTileRef) => `${tile.level}:${tile.col}:${tile.row}`;
class Source implements ImageTileSource {
  readonly kind = "avif" as const;
  priority: "high" | "low" = "high";
  cacheRevision: string | undefined = '"asset-v1"';
  compressedBytes = 0;
  requestCount = 0;
  bytes = new Set<string>();
  bitmaps = new Map<string, ImageBitmap>();
  fetches: ImageTileRef[] = [];
  decodeSignals: AbortSignal[] = [];
  decodeGate?: Promise<void>;
  open = vi.fn(async () => pyramid);
  pause = vi.fn();
  dispose = vi.fn();
  constructor(readonly url: string) {}
  hasBytes(tile: ImageTileRef) {
    return this.bytes.has(tileKey(tile));
  }
  async fetch(tiles: readonly ImageTileRef[], signal: AbortSignal) {
    signal.throwIfAborted();
    this.fetches.push(...tiles);
    for (const tile of tiles) this.bytes.add(tileKey(tile));
  }
  async decode(tile: ImageTileRef, signal: AbortSignal) {
    this.decodeSignals.push(signal);
    await this.decodeGate;
    signal.throwIfAborted();
    const image = bitmap(512, tile.level === 3 ? 256 : 512);
    this.bitmaps.set(tileKey(tile), image);
    return image;
  }
}
class Canvas {
  static instances: Canvas[] = [];
  context = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "low",
  };
  constructor(public width: number, public height: number) {
    Canvas.instances.push(this);
  }
  getContext() {
    return this.context;
  }
  async convertToBlob() {
    return new Blob(["encoded-thumbnail"], { type: "image/png" });
  }
  transferToImageBitmap() {
    return bitmap(this.width, this.height);
  }
}
const source: ThumbnailSource = {
  previewPath: "https://images.test/2024/preview",
  imageId: "photo",
  originalImageUrl: "https://images.test/original/photo.tif",
  avifPyramidUrl: "https://images.test/2024/native/photo.avif",
  avifFormat: "native",
  minimumQualityLevel: "1",
  nativeSize: { width: 2048, height: 1024 },
};
const descriptor = () =>
  nativePreviewSource({
    imageId: source.imageId,
    path: source.previewPath,
    sourceUrl: source.originalImageUrl!,
    avifPyramidUrl: source.avifPyramidUrl,
    avifFormat: source.avifFormat,
    nativeSize: pyramid.native,
    minimumQualityLevel: source.minimumQualityLevel,
  });
const view = (density = 0.5) => ({
  visible: { x: px(0), y: px(0), ...pyramid.native },
  density: density as Ratio,
});
const settle = async () => {
  for (let i = 0; i < 100; i++) await Promise.resolve();
};
let sources: Source[], descriptors: ImagePyramidSource[];
beforeEach(() => {
  sources = [];
  descriptors = [];
  Canvas.instances = [];
  state.stored.clear();
  vi.stubGlobal("Blob", NodeBlob);
  vi.stubGlobal("OffscreenCanvas", Canvas);
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => bitmap())
  );
  vi.stubGlobal(
    "Worker",
    vi.fn(() => {
      throw Error("No worker is needed for a shared thumbnail");
    })
  );
  state.pool = new ImageLevelStackPool({
    stackOptions: {
      idlePrefetch: "none",
      ringTiles: 0,
      decodeFinerAt: Infinity,
    },
    createSource(input) {
      descriptors.push(input);
      const item = new Source(input.url);
      sources.push(item);
      return item;
    },
  });
});
afterEach(() => {
  state.pool?.dispose();
  vi.unstubAllGlobals();
});

describe("shared preview thumbnail demand", () => {
  it("shares the active source and draws only its coarse plan without replacing the main view", async () => {
    const main = state.pool!.acquire(descriptor());
    await main.stack.ready;
    main.stack.setView(view(), 1024 * 512);
    await settle();
    const mainPlan = main.stack.plan;
    const image = await createSharedPreviewThumbnail(
      source,
      "thumbnail-key",
      new AbortController().signal
    );
    if ("persistence" in image) await image.persistence;
    expect(sources).toHaveLength(1);
    expect(sources[0].open).toHaveBeenCalledOnce();
    expect(descriptors[0].fallbacks?.[0]).toMatchObject({
      kind: "jpeg",
      jpegLevels: [1, 2, 3, 4, 5, 6],
    });
    expect(main.stack.plan).toBe(mainPlan);
    expect(main.stack.visibleReady).toBe(true);
    expect(state.pool!.hasForeground(descriptor())).toBe(true);
    expect(sources[0].dispose).not.toHaveBeenCalled();
    expect(
      Canvas.instances[0].context.drawImage.mock.calls.every(
        (call) => call[0] === sources[0].bitmaps.get("3:0:0")
      )
    ).toBe(true);
    expect(Canvas.instances[0].context.drawImage).toHaveBeenCalledOnce();
    expect(globalThis.Worker).not.toHaveBeenCalled();
    image.bitmap.close();
    main.release();
  });

  it("restores the revision-matched PNG while retaining the original source owner and avoiding new image work", async () => {
    const main = state.pool!.acquire(descriptor());
    await main.stack.ready;
    // Retain the owner without a main-view request, so every fetch here belongs
    // to the thumbnail rather than the primary plan's finer-level prewarming.
    const first = await createSharedPreviewThumbnail(
      source,
      "persisted-key",
      new AbortController().signal
    );
    expect("persistence" in first && (await first.persistence)).toBe(true);
    first.bitmap.close();
    const fetches = sources[0].fetches.length;
    const decodes = sources[0].decodeSignals.length;
    const second = await createSharedPreviewThumbnail(
      source,
      "persisted-key",
      new AbortController().signal
    );
    expect(second.persisted).toBe(true);
    expect(globalThis.createImageBitmap).toHaveBeenCalledWith(expect.any(Blob));
    expect(sources[0].fetches).toHaveLength(fetches);
    expect(sources[0].decodeSignals).toHaveLength(decodes);
    expect(sources[0].fetches.map(tileKey)).toEqual(["3:0:0"]);
    expect(sources[0].open).toHaveBeenCalledOnce();
    expect(sources[0].dispose).not.toHaveBeenCalled();
    expect(state.pool!.hasForeground(descriptor())).toBe(true);
    second.bitmap.close();
    main.release();
  });

  it("releasing an aborted thumbnail leaves an in-flight main decode alive", async () => {
    const main = state.pool!.acquire(descriptor());
    await main.stack.ready;
    let resume!: () => void;
    sources[0].decodeGate = new Promise((resolve) => {
      resume = resolve;
    });
    main.stack.setView(view(0.25), 512 * 256);
    const abort = new AbortController();
    const pending = createSharedPreviewThumbnail(
      source,
      "abort-key",
      abort.signal
    );
    await settle();
    abort.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(sources[0].decodeSignals.length).toBeGreaterThan(0);
    expect(sources[0].decodeSignals.every((signal) => !signal.aborted)).toBe(
      true
    );
    expect(sources[0].dispose).not.toHaveBeenCalled();
    resume();
    await settle();
    expect(main.stack.visibleReady).toBe(true);
    main.release();
  });

  it("does not reuse a PNG under an unknown or changed source revision", async () => {
    const image = await createSharedPreviewThumbnail(
      source,
      "revision-key",
      new AbortController().signal
    );
    if ("persistence" in image) await image.persistence;
    const signal = new AbortController().signal;
    expect(
      await readSharedThumbnailBlob("revision-key", '"asset-v1"', signal)
    ).toBeInstanceOf(Blob);
    expect(
      await readSharedThumbnailBlob("revision-key", '"asset-v2"', signal)
    ).toBeUndefined();
    expect(
      await readSharedThumbnailBlob("revision-key", undefined, signal)
    ).toBeUndefined();
    expect(sources[0].fetches.every((tile) => tile.level === 3)).toBe(true);
    image.bitmap.close();
  });
});
