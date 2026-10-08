// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DevicePixels } from "@carma-units";
import type { JpegPyramidLevel } from "../core/image-viewport-window";
import type { NativePreviewWindow } from "../core/image-viewport-window";

const pipeline = vi.hoisted(() => ({
  construct: vi.fn(),
  select: vi.fn(),
  read: vi.fn(),
  nativeDraw: vi.fn(),
}));
const avifPipeline = vi.hoisted(() => ({
  select: vi.fn(),
  drawBBoxTo: vi.fn(),
  close: vi.fn(),
  park: vi.fn(),
  construct: vi.fn(),
  setActiveCacheBudget: vi.fn(),
  prewarm: vi.fn(),
  prewarmNextLevel: vi.fn(),
  warmNeighborhood: vi.fn(),
  warmVisibleDecoded: vi.fn(),
  availablePage: vi.fn(),
  ensureOverview: vi.fn(),
  hasCached: vi.fn(),
  hasLocallyAvailable: vi.fn(),
  ensureLocalAvailability: vi.fn(),
  residentBytes: 0,
  maxSourceDensity: 0.5,
}));
vi.mock("./avif-pyramid-preview-source", () => ({
  AvifPyramidPreviewSource: class {
    constructor(readonly url: string, budget?: number) {
      avifPipeline.construct(url, budget);
    }
    get residentBytes() {
      return avifPipeline.residentBytes;
    }
    get maxSourceDensity() {
      return avifPipeline.maxSourceDensity;
    }
    get memoryMetrics() {
      return {
        rangeBytes: avifPipeline.residentBytes,
        decodedBytes: 0,
        residentBytes: avifPipeline.residentBytes,
      };
    }
    setActiveCacheBudget = avifPipeline.setActiveCacheBudget;
    prewarm = avifPipeline.prewarm;
    prewarmNextLevel = avifPipeline.prewarmNextLevel;
    warmNeighborhood = avifPipeline.warmNeighborhood;
    warmVisibleDecoded = avifPipeline.warmVisibleDecoded;
    availablePage = avifPipeline.availablePage;
    ensureOverview = avifPipeline.ensureOverview;
    get neighborhoodReadiness() { return []; }
    get levelReadiness() { return []; }
    hasCached = avifPipeline.hasCached;
    hasLocallyAvailable = avifPipeline.hasLocallyAvailable;
    ensureLocalAvailability = avifPipeline.ensureLocalAvailability;
    select = avifPipeline.select;
    drawBBoxTo = avifPipeline.drawBBoxTo;
    close = avifPipeline.close;
    park = avifPipeline.park;
  },
}));
vi.mock("./tiff-preview-source", () => ({
  TiffPreviewSource: class {
    constructor(readonly url: string, budget?: number, priority?: string) {
      pipeline.construct(url, budget, priority);
    }
    select = pipeline.select;
    read = pipeline.read;
  },
}));

type Request = {
  url: string;
  window: NativePreviewWindow;
  nativeSize: { width: DevicePixels; height: DevicePixels };
  flipForTexture: boolean;
  minimumQualityLevel?: JpegPyramidLevel;
  maxInitialDisplayPixelSize?: number;
  maxSourceDensity?: number;
  refineToNative?: boolean;
  priority?: "low" | "high" | "auto";
  generation: number;
  tiff?: boolean;
  avifPyramidUrl?: string;
  avifOnly?: boolean;
  cancel?: boolean;
  park?: boolean;
  retainedSourceByteLimit?: number;
  activeSourceByteLimit?: number;
  imageId?: string;
  sourceIdentity?: string;
  retainWholeImage?: boolean;
  reusePublished?: boolean;
  releaseCanvasAfterPublish?: boolean;
  activity?: boolean;
  warmWindow?: NativePreviewWindow;
  budgetOnly?: boolean;
};
type Published = {
  bitmap?: ImageBitmap;
  generation?: number;
  kind?: "full-image" | "source-memory" | "prepared-frame";
  preparedDirection?: "in" | "out";
  imageId?: string;
  sourceIdentity?: string;
  sourceUrl?: string;
  sourceResidentBytes?: number;
  workerMemory?: {
    compositionBytes: number;
    decodeCanvasBytes: number;
    workingBytes: number;
  };
  reusePublished?: boolean;
  missing?: boolean;
  sourceWidth?: number;
  sourceHeight?: number;
  sourceLevel?: number;
  complete?: boolean;
  error?: string;
  refinementFailed?: boolean;
  sourceBackend?: string;
  crop?: NativePreviewWindow["source"];
  sampleDensity?: number;
};
const px = (value: number) => value as DevicePixels;
const nativeSize = { width: px(512), height: px(384) };
const windowAt = (width = 32, height = 24, x = 64): NativePreviewWindow => ({
  source: { x: px(x), y: px(32), width: px(256), height: px(192) },
  target: { width: px(width), height: px(height) },
});
const url = "https://imagery.test/3/photo.jpg?signature=opaque";
const request = (overrides: Partial<Request> = {}): Request => ({
  url,
  window: windowAt(),
  nativeSize,
  flipForTexture: true,
  minimumQualityLevel: "1",
  generation: 1,
  ...overrides,
});

class Canvas {
  static instances: Canvas[] = [];
  context = {
    reset: vi.fn(),
    clearRect: vi.fn(),
    drawImage: pipeline.nativeDraw,
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray([32, 64, 96, 255]),
    })),
    putImageData: vi.fn(),
  };
  constructor(public width: number, public height: number) {
    Canvas.instances.push(this);
  }
  getContext = vi.fn(() => this.context);
}
const bitmaps: Array<ImageBitmap & { close: ReturnType<typeof vi.fn> }> = [];
const makeBitmap = (width: number, height: number) => {
  const value = { width, height, close: vi.fn() } as unknown as ImageBitmap & {
    close: ReturnType<typeof vi.fn>;
  };
  bitmaps.push(value);
  return value;
};
const storage = new Map<string, Response>();
const cache = {
  keys: vi.fn(async () =>
    [...storage.keys()].map((key) => new globalThis.Request(key))
  ),
  match: vi.fn(async (key: string | globalThis.Request | URL) =>
    storage.get(typeof key === "string" ? key : key instanceof URL ? key.href : key.url)?.clone()
  ),
  put: vi.fn(async (key: string, response: Response) => {
    storage.set(key, response.clone());
  }),
  delete: vi.fn(async (key: globalThis.Request) => storage.delete(key.url)),
};
let worker: {
  onmessage: ((event: MessageEvent<Request>) => Promise<void>) | null;
  postMessage: ReturnType<typeof vi.fn>;
};
let decode: ReturnType<typeof vi.fn>;
let network: ReturnType<typeof vi.fn>;
const published = (): Published[] =>
  worker.postMessage.mock.calls.map(([value]) => value);
const foreground = () =>
  published().filter((message) => message.kind === undefined);
let testInteractionActive = false;
const send = (
  value: Request | { budgetOnly: true; activeSourceByteLimit?: number }
) => {
  if ("activity" in value && value.activity !== undefined) testInteractionActive = value.activity;
  return worker.onmessage!({ data: value } as MessageEvent<Request>);
};
const finish = async (pending: Promise<void>) => {
  let settled = false;
  void pending.finally(() => {
    settled = true;
  });
  // Advance foreground yields/deadlines in small steps. Running every timer
  // also starts idle forecasts after the foreground has already completed.
  for (let step = 0; step < 1000 && !settled; step++) {
    for (let microtask = 0; microtask < 20 && !settled; microtask++) await Promise.resolve();
    if (!settled) await vi.advanceTimersToNextTimerAsync();
  }
  expect(settled).toBe(true);
  await pending;
};
const levelOf = (value: string) =>
  Number(new URL(value).pathname.match(/\/([0-6])\/[^/]+$/)![1]);
const seed = (level: JpegPyramidLevel) => {
  const value = new URL(url);
  value.pathname = value.pathname.replace("/3/", "/" + level + "/");
  storage.set(value.href, new Response(new Blob([value.href])));
};

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.resetModules();
  vi.clearAllMocks();
  storage.clear();
  bitmaps.length = 0;
  Canvas.instances.length = 0;
  worker = { onmessage: null, postMessage: vi.fn() };
  vi.stubGlobal("self", worker);
  vi.stubGlobal("OffscreenCanvas", Canvas);
  vi.stubGlobal(
    "ImageData",
    class {
      constructor(
        readonly data: Uint8ClampedArray,
        readonly width: number,
        readonly height: number
      ) {}
    }
  );
  vi.stubGlobal(
    "Image",
    vi.fn(() => {
      throw new Error("Worker must not decode a DOM image");
    })
  );
  vi.stubGlobal("caches", { open: vi.fn(async () => cache) });
  network = vi.fn(async (input: string, _options?: RequestInit) => ({
    ok: true,
    headers: new Headers(),
    blob: async () => new Blob([input]),
  }));
  vi.stubGlobal("fetch", network);
  decode = vi.fn(
    async (input: Blob | Canvas | ImageBitmap, ...args: unknown[]) => {
      if (input instanceof Blob) {
        const level = levelOf(await input.text());
        return makeBitmap(
          nativeSize.width / 2 ** level,
          nativeSize.height / 2 ** level
        );
      }
      if (input instanceof Canvas) return makeBitmap(input.width, input.height);
      if (args[0] && typeof args[0] === "object" && "resizeWidth" in args[0]) {
        const options = args[0] as {
          resizeWidth: number;
          resizeHeight: number;
        };
        return makeBitmap(options.resizeWidth, options.resizeHeight);
      }
      if (args.length <= 1) return makeBitmap(input.width, input.height);
      return makeBitmap(args[2] as number, args[3] as number);
    }
  );
  vi.stubGlobal("createImageBitmap", decode);
  pipeline.read.mockResolvedValue(new Uint8ClampedArray([32, 64, 96, 255]));
  pipeline.select.mockReset();
  avifPipeline.select.mockReset();
  avifPipeline.residentBytes = 0;
  avifPipeline.maxSourceDensity = 0.5;
  avifPipeline.prewarm.mockReset().mockResolvedValue(undefined);
  avifPipeline.prewarmNextLevel.mockReset().mockResolvedValue(undefined);
  avifPipeline.warmNeighborhood.mockReset().mockResolvedValue(undefined);
  avifPipeline.warmVisibleDecoded.mockReset().mockResolvedValue(undefined);
  avifPipeline.availablePage.mockReset().mockReturnValue(null);
  avifPipeline.ensureOverview.mockReset().mockResolvedValue(null);
  avifPipeline.setActiveCacheBudget.mockReset();
  avifPipeline.hasCached.mockReset().mockReturnValue(false);
  avifPipeline.hasLocallyAvailable.mockReset().mockReturnValue(false);
  avifPipeline.ensureLocalAvailability.mockReset().mockResolvedValue(undefined);
  avifPipeline.drawBBoxTo.mockReset().mockImplementation(async (
    page: { getWidth: () => number; getHeight: () => number }, bounds: number[],
    context: OffscreenCanvasRenderingContext2D,
    destination: { x: number; y: number; width: number; height: number }
  ) => context.drawImage({ width: page.getWidth(), height: page.getHeight() } as ImageBitmap,
    bounds[0], bounds[1], bounds[2] - bounds[0], bounds[3] - bounds[1],
    destination.x, destination.y, destination.width, destination.height));
  await import("./preview-rgb.worker");
  // Foreground cases represent an active gesture; idle runs only when a case settles it.
  await send(request({ activity: true }));
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("worker-owned progressive image pyramid", () => {
  it("stops a JPEG family at the first physically sufficient level instead of fetching full native detail", async () => {
    await finish(send(request({ window: windowAt(40, 30) })));
    expect(network.mock.calls.map(([asset]) => levelOf(asset))).toEqual([
      5, 4, 3, 2,
    ]);
    expect(published().at(-1)).toMatchObject({
      sourceWidth: 128,
      sourceHeight: 96,
      complete: true,
    });
    expect(published().at(-1)?.sourceResidentBytes).toBe(128 * 96 * 4);
  });

  it("releases an oversized decoded JPEG while preserving encoded bytes and the completed crop", async () => {
    seed("1");
    await finish(send(request({ activeSourceByteLimit: 4096 })));
    const fullSource = bitmaps.find(
      (bitmap) => bitmap.width === 256 && bitmap.height === 192
    )!;
    expect(fullSource.close).toHaveBeenCalledOnce();
    expect(published().at(-1)).toMatchObject({
      sourceWidth: 256,
      sourceResidentBytes: 0,
      complete: true,
    });
    const decodes = decode.mock.calls.length;
    await finish(
      send(
        request({
          generation: 2,
          activeSourceByteLimit: 4096,
          reusePublished: true,
        })
      )
    );
    expect(decode).toHaveBeenCalledTimes(decodes);
    expect(published().at(-1)).toMatchObject({
      reusePublished: true,
      sourceResidentBytes: 0,
    });
    expect(storage.size).toBe(1);
    expect(network).not.toHaveBeenCalled();
  });
  it("publishes JPEG refinements from the eight-pixel cap only through physical display density", async () => {
    await finish(send(request()));
    expect(network.mock.calls.map(([asset]) => levelOf(asset))).toEqual([
      6, 5, 4, 3,
    ]);
    expect(
      network.mock.calls.every(
        ([asset]) => new URL(asset).search === "?signature=opaque"
      )
    ).toBe(true);
    expect(published().map((value) => value.sourceWidth)).toEqual([
      8, 16, 32, 64,
    ]);
    expect(published().map((value) => value.sourceHeight)).toEqual([
      6, 12, 24, 48,
    ]);
    expect(published().map((value) => value.complete)).toEqual([
      false,
      false,
      false,
      true,
    ]);
    const first = published()[0];
    expect(
      windowAt().target.width /
        ((windowAt().source.width * first.sourceWidth!) / nativeSize.width)
    ).toBe(8);
    expect(
      published().every(
        (value) => value.generation === 1 && value.bitmap && !value.error
      )
    ).toBe(true);
    expect(pipeline.nativeDraw).toHaveBeenCalledTimes(4);
    expect(globalThis.Image).not.toHaveBeenCalled();
    expect(typeof document).toBe("undefined");
    expect(Canvas.instances).toHaveLength(1); // one output crop; no RGBA scratch surfaces
    const outputs = decode.mock.calls
      .map(([input]) => input)
      .filter((input) => input instanceof Canvas);
    expect(new Set(outputs).size).toBe(1);
    expect((outputs[0] as Canvas).width).toBe(windowAt().target.width);
    expect((outputs[0] as Canvas).height).toBe(windowAt().target.height);
  });

  it.each([
    { width: 33, height: 24, first: 5, minimum: "3" as const },
    { width: 32, height: 96, first: 4, minimum: "1" as const },
    { width: 64, height: 48, first: 5, minimum: "2" as const },
    { width: 256, height: 192, first: 3, minimum: "3" as const },
  ])(
    "selects the stricter physical axis for $width x $height and stops at $minimum",
    async ({ width, height, first, minimum }) => {
      vi.stubGlobal("devicePixelRatio", 4);
      await finish(
        send(
          request({
            window: windowAt(width, height),
            minimumQualityLevel: minimum,
          })
        )
      );
      expect(network.mock.calls.map(([asset]) => levelOf(asset))).toEqual(
        Array.from(
          { length: first - Number(minimum) + 1 },
          (_, index) => first - index
        )
      );
      expect(published()[0].sourceWidth).toBe(nativeSize.width / 2 ** first);
      expect(
        width / (windowAt().source.width / 2 ** first)
      ).toBeLessThanOrEqual(8);
      expect(
        height / (windowAt().source.height / 2 ** first)
      ).toBeLessThanOrEqual(8);
    }
  );

  it("uses a cached finer encoded source immediately without fetching or decoding coarser levels", async () => {
    seed("1");
    await finish(send(request()));
    expect(network).not.toHaveBeenCalled();
    expect(published().map((value) => value.sourceWidth)).toEqual([256]);
    expect(
      decode.mock.calls.filter(([input]) => input instanceof Blob)
    ).toHaveLength(1);
    // The requested coarse address misses, then the nearest stored finer
    // member is decoded directly. Neither lookup requests image data online.
    expect(cache.match).toHaveBeenCalledTimes(2);
  });

  it("keeps the retained fine source across a changed crop and reuses an identical completed viewport", async () => {
    await finish(send(request()));
    const downloads = network.mock.calls.length;
    const decoded = decode.mock.calls.filter(
      ([input]) => input instanceof Blob
    ).length;
    worker.postMessage.mockClear();
    await finish(
      send(request({ generation: 2, window: windowAt(32, 24, 128) }))
    );
    expect(published().map((value) => value.sourceWidth)).toEqual([64]);
    expect(network).toHaveBeenCalledTimes(downloads);
    expect(
      decode.mock.calls.filter(([input]) => input instanceof Blob)
    ).toHaveLength(decoded);
    const compositions = pipeline.nativeDraw.mock.calls.length;
    worker.postMessage.mockClear();
    await finish(
      send(request({ generation: 3, window: windowAt(32, 24, 128) }))
    );
    expect(published()).toHaveLength(1);
    expect(published()[0]).toMatchObject({ generation: 3, sourceWidth: 64 });
    expect(pipeline.nativeDraw).toHaveBeenCalledTimes(compositions);
  });

  it("aborts a pending JPEG download without publishing stale pixels or errors", async () => {
    let signal: AbortSignal | undefined;
    network.mockImplementationOnce(
      (_input: string, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          signal = options.signal!;
          signal.addEventListener("abort", () => reject(signal!.reason), {
            once: true,
          });
        })
    );
    const pending = send(request());
    await vi.advanceTimersByTimeAsync(0);
    expect(signal).toBeDefined();
    await send(request({ cancel: true, generation: 2 }));
    await finish(pending);
    expect(signal!.aborted).toBe(true);
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(decode).not.toHaveBeenCalled();
  });

  it("reuses subpixel-aligned completed pixels with their actual source crop", async () => {
    await finish(send(request()));
    const count = pipeline.nativeDraw.mock.calls.length,
      downloads = network.mock.calls.length;
    worker.postMessage.mockClear();
    const next = windowAt();
    next.source.x = px(next.source.x + 0.1);
    await finish(send(request({ generation: 2, window: next })));
    expect(published()).toHaveLength(1);
    expect(published()[0]).toMatchObject({
      crop: windowAt().source,
      sampleDensity: 0.125,
      complete: true,
    });
    expect(pipeline.nativeDraw).toHaveBeenCalledTimes(count);
    expect(network).toHaveBeenCalledTimes(downloads);
  });
  it("responds immediately with actual retained crop when it already covers a lower-density target", async () => {
    await finish(send(request()));
    const original = windowAt();
    const narrower: NativePreviewWindow = {
      source: { x: px(96), y: px(64), width: px(128), height: px(96) },
      target: { width: px(12), height: px(9) },
    };
    const downloads = network.mock.calls.length,
      compositions = pipeline.nativeDraw.mock.calls.length;
    worker.postMessage.mockClear();
    await finish(send(request({ generation: 2, window: narrower })));
    expect(published()).toHaveLength(1);
    expect(published()[0]).toMatchObject({
      crop: original.source,
      complete: true,
      sampleDensity: 0.125,
    });
    expect(network).toHaveBeenCalledTimes(downloads);
    expect(pipeline.nativeDraw).toHaveBeenCalledTimes(compositions);
  });
  it("recomposes a smaller covered crop after zooming out past2x instead of reusing its oversized canvas", async () => {
    await finish(send(request()));
    const before = pipeline.nativeDraw.mock.calls.length;
    worker.postMessage.mockClear();
    await finish(
      send(
        request({ generation: 2, reusePublished: true, window: windowAt(8, 6) })
      )
    );
    expect(pipeline.nativeDraw.mock.calls.length).toBeGreaterThan(before);
    expect(published().at(-1)).toMatchObject({ generation: 2, complete: true });
    expect(published().at(-1)?.reusePublished).toBeUndefined();
    expect(published().at(-1)?.bitmap?.width).toBe(8);
    expect(published().at(-1)?.bitmap?.height).toBe(6);
    expect(published().at(-1)?.workerMemory?.compositionBytes).toBe(8 * 6 * 4);
  });
  it("refines a downsampled retained L1 viewport with a physically sufficient L2 crop", async () => {
    const avifUrl = "https://imagery.test/photo.avif";
    const l1 = { level: 1, getWidth: () => 256, getHeight: () => 192 };
    const l2 = { level: 2, getWidth: () => 128, getHeight: () => 96 };
    const low = { level: 4, getWidth: () => 32, getHeight: () => 24 };
    const full: NativePreviewWindow = {
      source: { x: px(0), y: px(0), width: px(512), height: px(384) },
      target: { width: px(40), height: px(30) },
    };
    avifPipeline.select.mockResolvedValueOnce({ image: l1, refinements: [] });
    await finish(send(request({ avifPyramidUrl: avifUrl, window: full })));
    expect(foreground().at(-1)?.sampleDensity).toBe(40 / 512);
    worker.postMessage.mockClear();
    avifPipeline.drawBBoxTo.mockClear();
    avifPipeline.select.mockResolvedValueOnce({
      image: low,
      refinements: [l2],
    });
    await finish(
      send(
        request({
          generation: 2,
          avifPyramidUrl: avifUrl,
          window: windowAt(40, 30),
        })
      )
    );
    expect(foreground().at(-1)).toMatchObject({
      sourceWidth: 128,
      complete: true,
      sampleDensity: 40 / 256,
      crop: windowAt(40, 30).source,
    });
    expect(avifPipeline.drawBBoxTo.mock.calls.every(([page]) => page !== l1)).toBe(
      true
    );
  });
  it("stops finer JPEG levels when a new generation cancels after the first publication", async () => {
    worker.postMessage.mockImplementationOnce(() => {
      void send(request({ cancel: true, generation: 2 }));
    });
    await finish(send(request()));
    expect(published().map((value) => value.sourceWidth)).toEqual([8]);
    expect(network.mock.calls.map(([asset]) => levelOf(asset))).toEqual([6]);
  });

  it.each([
    { window: windowAt(), expected: 4 },
    { window: windowAt(32, 96), expected: 2 },
  ])(
    "finishes one display-matching JPEG ROI with the requested three-pixel cap ($expected)",
    async ({ window, expected }) => {
      await finish(
        send(
          request({
            window,
            maxInitialDisplayPixelSize: 3,
            refineToNative: false,
          })
        )
      );
      expect(network.mock.calls.map(([asset]) => levelOf(asset))).toEqual([
        expected,
      ]);
      expect(published()).toHaveLength(1);
      const result = published()[0];
      expect(result.complete).toBe(true);
      expect(
        window.target.width /
          ((window.source.width * result.sourceWidth!) / nativeSize.width)
      ).toBeLessThanOrEqual(3);
      expect(
        window.target.height /
          ((window.source.height * result.sourceHeight!) / nativeSize.height)
      ).toBeLessThanOrEqual(3);
    }
  );

  it("does not treat a completed low-resolution ROI as a completed native refinement", async () => {
    await finish(
      send(request({ maxInitialDisplayPixelSize: 1, refineToNative: false }))
    );
    expect(published().map((value) => value.sourceWidth)).toEqual([64]);
    expect(published()[0].complete).toBe(true);
    network.mockClear();
    worker.postMessage.mockClear();
    await finish(send(request({ generation: 2, window: windowAt(64, 48) })));
    expect(published().at(-1)).toMatchObject({
      generation: 2,
      sourceWidth: 128,
      complete: true,
    });
    expect(network.mock.calls.map(([asset]) => levelOf(asset))).toEqual([2]);
    expect(published().every((value) => value.sourceWidth! >= 64)).toBe(true);
  });

  it("limits TIFF preloading to the selected ROI page and reports completion exactly once", async () => {
    const initial = { getWidth: () => 128, getHeight: () => 96 };
    const native = { getWidth: () => 512, getHeight: () => 384 };
    pipeline.select.mockResolvedValue({
      image: initial,
      refinements: [native],
    });
    await finish(
      send(
        request({
          url: "https://imagery.test/photo.tif",
          tiff: true,
          maxInitialDisplayPixelSize: 3,
          refineToNative: false,
          priority: "low",
        })
      )
    );
    expect(pipeline.select).toHaveBeenCalledWith(
      windowAt(),
      nativeSize,
      expect.any(AbortSignal),
      3
    );
    expect(pipeline.construct).toHaveBeenCalledWith(
      "https://imagery.test/photo.tif",
      undefined,
      "low"
    );
    expect(pipeline.read.mock.calls.map(([image]) => image)).toEqual([initial]);
    expect(published()).toHaveLength(1);
    expect(published()[0]).toMatchObject({
      sourceWidth: 128,
      sourceHeight: 96,
      complete: true,
    });
    expect(network).not.toHaveBeenCalled();
  });

  it("passes the eight-pixel cap to TIFF metadata selection and publishes each finer page", async () => {
    const page = (factor: number) => ({
      getWidth: () => nativeSize.width / factor,
      getHeight: () => nativeSize.height / factor,
    });
    const initial = page(8),
      finer = page(4),
      original = page(1);
    pipeline.select.mockResolvedValue({
      image: initial,
      refinements: [finer, original],
    });
    await finish(
      send(request({ url: "https://imagery.test/photo.tif", tiff: true }))
    );
    expect(pipeline.select).toHaveBeenCalledWith(
      windowAt(),
      nativeSize,
      expect.any(AbortSignal),
      8
    );
    expect(published().map((value) => value.sourceWidth)).toEqual([
      64, 128, 512,
    ]);
    expect(published().map((value) => value.complete)).toEqual([
      false,
      false,
      true,
    ]);
    expect(pipeline.read.mock.calls.map(([image]) => image)).toEqual([
      initial,
      finer,
      original,
    ]);
    expect(network).not.toHaveBeenCalled();
    expect(globalThis.Image).not.toHaveBeenCalled();
  });
  it("prefers available calibrated AVIF stages in the real RGB composition path", async () => {
    const initial = { level: 3, getWidth: () => 64, getHeight: () => 48 },
      fine = { level: 1, getWidth: () => 256, getHeight: () => 192 };
    avifPipeline.select.mockResolvedValue({
      image: initial,
      refinements: [fine],
    });
    await finish(
      send(
        request({
          url: "https://imagery.test/photo.tif",
          tiff: true,
          avifPyramidUrl: "https://imagery.test/photo.avif",
        })
      )
    );
    expect(foreground().map((value) => value.sourceBackend)).toEqual([
      "avif-pyramid",
      "avif-pyramid",
    ]);
    expect(foreground().map((value) => value.complete)).toEqual([false, true]);
    expect(pipeline.select).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
    expect(avifPipeline.drawBBoxTo.mock.calls.map(([page]) => page)).toEqual([
      initial,
      fine,
    ]);
    expect(avifPipeline.select).toHaveBeenCalledWith(
      windowAt(),
      nativeSize,
      expect.any(AbortSignal),
      8
    );
  });
  it("keeps odd off-center native extent and landmark positions invariant across AVIF stages", async () => {
    const oddNative = { width: px(1025), height: px(769) };
    const crop: NativePreviewWindow = {
      source: { x: px(113), y: px(79), width: px(777), height: px(531) },
      target: { width: px(389), height: px(266) },
    };
    const coarse = { level: 3, getWidth: () => 129, getHeight: () => 97 };
    const fine = { level: 1, getWidth: () => 513, getHeight: () => 385 };
    avifPipeline.select.mockResolvedValue({ image: coarse, refinements: [fine] });
    await finish(send(wholeRequest({ nativeSize: oddNative, window: crop, retainWholeImage: false })));
    const frames = foreground().filter((message) => message.bitmap);
    expect(frames).toHaveLength(2);
    for (const frame of frames) {
      expect(frame.crop).toEqual(crop.source);
      expect(frame.bitmap).toMatchObject({ width: 389, height: 266 });
    }
    const landmark = { x: 515, y: 312 };
    for (const [page, bounds, , destination] of avifPipeline.drawBBoxTo.mock.calls) {
      // Reconstruct a real native landmark from the actual painter arguments.
      const imageX = landmark.x * page.getWidth() / oddNative.width;
      const imageY = landmark.y * page.getHeight() / oddNative.height;
      const screenX = destination.x + (imageX - bounds[0]) * destination.width / (bounds[2] - bounds[0]);
      const screenY = destination.y + (imageY - bounds[1]) * destination.height / (bounds[3] - bounds[1]);
      expect(screenX).toBeCloseTo((515 - 113) * 389 / 777, 12);
      expect(screenY).toBeCloseTo((312 - 79) * 266 / 531, 12);
    }
  });

  it("rejects a bitmap whose actual dimensions differ from its claimed crop target", async () => {
    const image = { level: 1, getWidth: () => 256, getHeight: () => 192 };
    avifPipeline.select.mockResolvedValue({ image, refinements: [] });
    const originalDecode = decode.getMockImplementation()!;
    let invalid!: ImageBitmap & { close: ReturnType<typeof vi.fn> };
    decode.mockImplementation(async (input: Blob | Canvas | ImageBitmap, ...args: unknown[]) => {
      if (input instanceof Canvas) {
        invalid = makeBitmap(1, 1);
        return invalid;
      }
      return originalDecode(input, ...args);
    });
    await finish(send(wholeRequest({ window: windowAt(128, 96), retainWholeImage: false })));
    expect(foreground()).toHaveLength(1);
    expect(foreground()[0].error).toContain("bitmap extent 1x1 differs from target 128x96");
    expect(foreground()[0].bitmap).toBeUndefined();
    expect(invalid.close).toHaveBeenCalledOnce();
  });

  it("completes both progressive stages after switching from one photo to another", async () => {
    const coarse = { level: 3, getWidth: () => 64, getHeight: () => 48 };
    const fine = { level: 1, getWidth: () => 256, getHeight: () => 192 };
    avifPipeline.select.mockResolvedValue({ image: coarse, refinements: [fine] });
    const flags = { retainWholeImage: false, releaseCanvasAfterPublish: true };
    await finish(send(wholeRequest({ ...flags, url: "https://imagery.test/a.avif",
      avifPyramidUrl: "https://imagery.test/a.avif", sourceIdentity: "https://imagery.test/a.avif", imageId: "a" })));
    const first = foreground().filter((frame) => frame.bitmap);
    expect(first.map((frame) => frame.sourceLevel)).toEqual([3, 1]);
    expect(first.map((frame) => frame.complete)).toEqual([false, true]);
    worker.postMessage.mockClear();
    await finish(send(wholeRequest({ ...flags, url: "https://imagery.test/b.avif",
      avifPyramidUrl: "https://imagery.test/b.avif", sourceIdentity: "https://imagery.test/b.avif", imageId: "b", generation: 2 })));
    const second = foreground().filter((frame) => frame.bitmap);
    expect(second.map((frame) => frame.sourceLevel)).toEqual([3, 1]);
    expect(second.map((frame) => frame.complete)).toEqual([false, true]);
    expect(second.map((frame) => frame.generation)).toEqual([2, 2]);
    expect(avifPipeline.construct.mock.calls.map(([asset]) => asset)).toEqual([
      "https://imagery.test/a.avif", "https://imagery.test/b.avif",
    ]);
    expect(avifPipeline.close).toHaveBeenCalledOnce();
    expect(published().filter((frame) => frame.error)).toEqual([]);
    expect(first.at(-1)!.bitmap!.close).not.toHaveBeenCalled();
  });

  it("resumes a parked photo's source and publishes its resident sharp stage without resetting the earlier bitmap", async () => {
    const coarse = { level: 3, getWidth: () => 64, getHeight: () => 48 };
    const fine = { level: 1, entry: { scale: 0.5 }, getWidth: () => 256, getHeight: () => 192 };
    avifPipeline.select.mockResolvedValue({ image: coarse, refinements: [fine] });
    const flags = { retainWholeImage: false, releaseCanvasAfterPublish: true };
    await finish(send(wholeRequest(flags)));
    const before = foreground().filter((frame) => frame.bitmap).at(-1)!.bitmap!;
    await send(wholeRequest({ ...flags, generation: 2, park: true, retainedSourceByteLimit: 4 * 1024 * 1024 }));
    expect(avifPipeline.park).toHaveBeenCalledWith(4 * 1024 * 1024);
    avifPipeline.availablePage.mockReturnValue(fine);
    worker.postMessage.mockClear();
    await finish(send(wholeRequest({ ...flags, generation: 3 })));
    const resumed = foreground().filter((frame) => frame.bitmap);
    expect(resumed).toHaveLength(1);
    expect(resumed[0]).toMatchObject({ generation: 3, sourceLevel: 1, complete: true });
    expect(avifPipeline.construct).toHaveBeenCalledTimes(1);
    expect(avifPipeline.close).not.toHaveBeenCalled();
    expect(before.close).not.toHaveBeenCalled();
  });

  it("settles a finer-stage failure while preserving already transferred coarse pixels", async () => {
    const coarse = { level: 3, getWidth: () => 64, getHeight: () => 48 };
    const fine = { level: 1, getWidth: () => 256, getHeight: () => 192 };
    avifPipeline.select.mockResolvedValue({ image: coarse, refinements: [fine] });
    const originalPaint = avifPipeline.drawBBoxTo.getMockImplementation()!;
    avifPipeline.drawBBoxTo.mockImplementation(async (page, ...args) => {
      if (page === fine) throw new Error("refusing 404 full-file response");
      return originalPaint(page, ...args);
    });
    await finish(send(wholeRequest({ retainWholeImage: false, releaseCanvasAfterPublish: true })));
    const frames = foreground();
    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({ sourceLevel: 3, complete: false });
    expect(frames[1]).toMatchObject({ generation: 1, refinementFailed: true, missing: false,
      error: "refusing 404 full-file response" });
    expect(frames[1].bitmap).toBeUndefined();
    expect(frames[0].bitmap!.close).not.toHaveBeenCalled();
  });

  it("applies a positive ROI-only budget without a viewport or photo session after parking", async () => {
    const image = { level: 1, getWidth: () => 256, getHeight: () => 192 };
    avifPipeline.select.mockResolvedValue({ image, refinements: [] });
    const flags = { retainWholeImage: false, releaseCanvasAfterPublish: true, activeSourceByteLimit: 1024 * 1024 };
    await finish(send(wholeRequest(flags)));
    await send(wholeRequest({ ...flags, generation: 2, park: true, retainedSourceByteLimit: 0 }));
    avifPipeline.setActiveCacheBudget.mockClear();
    await send({ budgetOnly: true, activeSourceByteLimit: 512 * 1024 });
    expect(avifPipeline.setActiveCacheBudget).toHaveBeenCalledTimes(1);
    expect(avifPipeline.setActiveCacheBudget).toHaveBeenCalledWith(512 * 1024);
    expect(avifPipeline.close).not.toHaveBeenCalled();
  });

  it("recovers a zero-budget ROI source while its finer stage is pending", async () => {
    const coarse = { level: 3, getWidth: () => 64, getHeight: () => 48 };
    const fine = { level: 1, getWidth: () => 256, getHeight: () => 192 };
    avifPipeline.select.mockResolvedValue({ image: coarse, refinements: [fine] });
    let currentBudget = 0;
    avifPipeline.setActiveCacheBudget.mockImplementation((value) => { currentBudget = value; });
    const originalPaint = avifPipeline.drawBBoxTo.getMockImplementation()!;
    let resumeFine!: () => void;
    let fineStarted = false;
    let fineBudget = 0;
    const gate = new Promise<void>((resolve) => { resumeFine = resolve; });
    avifPipeline.drawBBoxTo.mockImplementation(async (page, ...args) => {
      if (page === fine) {
        fineStarted = true;
        await gate;
        fineBudget = currentBudget;
      }
      return originalPaint(page, ...args);
    });
    const pending = send(wholeRequest({ retainWholeImage: false,
      releaseCanvasAfterPublish: true, activeSourceByteLimit: 0 }));
    await vi.advanceTimersByTimeAsync(5);
    expect(fineStarted).toBe(true);
    expect(currentBudget).toBe(0);
    await send({ budgetOnly: true, activeSourceByteLimit: 4096 });
    expect(currentBudget).toBe(4096);
    resumeFine();
    await finish(pending);
    expect(fineBudget).toBe(4096);
    expect(foreground().filter((frame) => frame.bitmap).map((frame) => frame.complete)).toEqual([false, true]);
    expect(foreground().filter((frame) => frame.error)).toEqual([]);
  });

  it("draws one native whole viewport without RGBA scratch deductions from the AVIF cache", async () => {
    const image = { level: 1, getWidth: () => 256, getHeight: () => 192 };
    avifPipeline.select.mockResolvedValue({ image, refinements: [] });
    const budget = 8 * 1024 * 1024;
    await finish(send(request({
      avifPyramidUrl: "https://imagery.test/bounded.avif",
      window: windowAt(1200, 900), activeSourceByteLimit: budget,
    })));
    expect(avifPipeline.drawBBoxTo).toHaveBeenCalledTimes(1);
    expect(avifPipeline.drawBBoxTo).toHaveBeenCalledWith(image,
      [32, 16, 160, 112], expect.any(Object),
      { x: 0, y: 0, width: 1200, height: 900 }, expect.any(AbortSignal));
    expect(avifPipeline.construct.mock.calls[0][1]).toBe(budget);
    expect(avifPipeline.setActiveCacheBudget.mock.calls.at(-1)![0]).toBe(budget);
    expect(Canvas.instances).toHaveLength(1);
    expect(Canvas.instances[0].context.getImageData).not.toHaveBeenCalled();
    expect(Canvas.instances[0].context.putImageData).not.toHaveBeenCalled();
    expect(foreground().at(-1)?.workerMemory).toMatchObject({
      compositionBytes: 1200 * 900 * 4, decodeCanvasBytes: 0, workingBytes: 0,
    });
    await send({ budgetOnly: true, activeSourceByteLimit: budget / 2 });
    expect(avifPipeline.setActiveCacheBudget.mock.calls.at(-1)![0]).toBe(budget / 2);
    await send(request({ budgetOnly: true, activeSourceByteLimit: budget / 2, window: windowAt() }));
    expect(avifPipeline.setActiveCacheBudget.mock.calls.at(-1)![0]).toBe(budget / 2);
  });
  it("refines a generic full-resolution AVIF source beyond the public oblique L1 density cap", async () => {
    avifPipeline.maxSourceDensity = 1;
    const half = { level: 2, getWidth: () => 256, getHeight: () => 192 },
      full = { level: 1, getWidth: () => 512, getHeight: () => 384 };
    avifPipeline.select.mockResolvedValueOnce({ image: half, refinements: [] });
    const input = request({
      avifPyramidUrl: "https://imagery.test/fullres.avif",
      maxSourceDensity: 1,
      window: windowAt(128, 96),
    });
    await finish(send(input));
    avifPipeline.select.mockResolvedValueOnce({ image: full, refinements: [] });
    worker.postMessage.mockClear();
    await finish(
      send({
        ...input,
        generation: 2,
        reusePublished: true,
        window: windowAt(192, 144),
      })
    );
    expect(foreground().at(-1)).toMatchObject({
      sourceWidth: 512,
      sampleDensity: 0.75,
      complete: true,
    });
    expect(foreground().at(-1)?.reusePublished).toBeUndefined();
  });
  it("keeps original TIFF fallback when a partially published AVIF photo is unavailable", async () => {
    avifPipeline.select.mockRejectedValue(
      new Error("AVIF metadata unavailable (404)")
    );
    const image = { getWidth: () => 128, getHeight: () => 96 };
    pipeline.select.mockResolvedValue({ image, refinements: [] });
    await finish(
      send(
        request({
          url: "https://imagery.test/photo.tif",
          tiff: true,
          avifPyramidUrl: "https://imagery.test/photo.avif",
        })
      )
    );
    expect(published()[0]).toMatchObject({
      sourceBackend: "tiff",
      complete: true,
    });
    expect(pipeline.select).toHaveBeenCalledOnce();
    expect(avifPipeline.close).toHaveBeenCalledOnce();
  });
  it("fails AVIF-only missing metadata without TIFF or whole-image fetch, including a cheap repeated miss", async () => {
    avifPipeline.select.mockRejectedValue(
      new Error("AVIF requires HTTP 206; refusing 404 full-file response")
    );
    const input = request({
      avifOnly: true,
      tiff: true,
      avifPyramidUrl: "https://imagery.test/pending.avif",
      url: "https://imagery.test/pending.avif",
    });
    await finish(send(input));
    expect(published().at(-1)?.error).toMatch(/AVIF/);
    expect(published().at(-1)?.missing).toBe(true);
    expect(pipeline.construct).not.toHaveBeenCalled();
    expect(pipeline.select).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
    await finish(send({ ...input, generation: 2 }));
    expect(avifPipeline.select).toHaveBeenCalledOnce();
    expect(network).not.toHaveBeenCalled();
  });
  it("does not decode a whole AVIF URL as JPEG when strict mode has no pyramid descriptor", async () => {
    await finish(
      send(
        request({
          avifOnly: true,
          url: "https://imagery.test/photo.avif",
          avifPyramidUrl: undefined,
        })
      )
    );
    expect(published().at(-1)?.error).toMatch(/AVIF-only/);
    expect(network).not.toHaveBeenCalled();
    expect(decode).not.toHaveBeenCalled();
    expect(pipeline.construct).not.toHaveBeenCalled();
  });
  it("rechecks AVIF after the partial-rollout miss expires even when the TIFF viewport is cached", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    try {
      avifPipeline.select.mockRejectedValueOnce(new Error("AVIF unavailable"));
      pipeline.select.mockResolvedValue({
        image: { getWidth: () => 128, getHeight: () => 96 },
        refinements: [],
      });
      const input = request({
        url: "https://imagery.test/photo.tif",
        tiff: true,
        avifPyramidUrl: "https://imagery.test/photo.avif",
      });
      await finish(send(input));
      expect(published().at(-1)?.sourceBackend).toBe("tiff");
      clock.mockReturnValue(32000);
      avifPipeline.select.mockResolvedValue({
        image: { level: 1, getWidth: () => 256, getHeight: () => 192 },
        refinements: [],
      });
      await finish(send({ ...input, generation: 2 }));
      expect(foreground().at(-1)?.sourceBackend).toBe("avif-pyramid");
      expect(avifPipeline.select).toHaveBeenCalledTimes(2);
      expect(pipeline.select).toHaveBeenCalledOnce();
    } finally {
      clock.mockRestore();
    }
  });
});

it.each([
  "Failed to fetch",
  "Load failed",
  "NetworkError when attempting to fetch resource.",
])("marks native fetch/CORS failure unavailable %s", async (message) => {
  avifPipeline.select.mockRejectedValue(new TypeError(message));
  await finish(
    send(
      request({
        avifOnly: true,
        tiff: true,
        avifPyramidUrl: "https://imagery.test/cors.avif",
        url: "https://imagery.test/cors.avif",
      })
    )
  );
  expect(published().at(-1)?.missing).toBe(true);
  expect(pipeline.construct).not.toHaveBeenCalled();
});
it("keeps ordinary decode failure distinct from unavailable", async () => {
  avifPipeline.select.mockRejectedValue(
    new TypeError("Cannot read properties of undefined")
  );
  await finish(
    send(
      request({
        avifOnly: true,
        tiff: true,
        avifPyramidUrl: "https://imagery.test/decode.avif",
        url: "https://imagery.test/decode.avif",
      })
    )
  );
  expect(published().at(-1)?.missing).toBe(false);
});

const drainPhotoBackground = async () => {
  if (testInteractionActive) await send(request({ activity: false }));
  for (let step = 0; step < 12; step++) {
    await Promise.resolve();
    await vi.runAllTimersAsync();
  }
};
const wholeRequest = (overrides: Partial<Request> = {}) =>
  request({
    url: "https://imagery.test/whole.avif",
    avifPyramidUrl: "https://imagery.test/whole.avif",
    avifOnly: true,
    tiff: true,
    imageId: "whole-photo",
    sourceIdentity: "https://imagery.test/whole.avif",
    retainWholeImage: true,
    ...overrides,
  });
const configureWholeSource = () => {
  const image = { level: 1, getWidth: () => 256, getHeight: () => 192 };
  avifPipeline.select.mockResolvedValue({ image, refinements: [] });
  return image;
};
describe("current photo encoded prewarming session", () => {
  it("releases its published composition without closing transferred pixels and recomposes an identical request", async () => {
    configureWholeSource();
    const flags = {
      retainWholeImage: false,
      releaseCanvasAfterPublish: true,
      activeSourceByteLimit: 1024 * 1024,
    };
    await finish(send(wholeRequest(flags)));
    const first = foreground().filter((message) => message.bitmap && message.complete).at(-1);
    expect(first).toMatchObject({
      generation: 1,
      sourceBackend: "avif-pyramid",
      sourceWidth: 256,
      sourceHeight: 192,
      bitmap: { width: 32, height: 24 },
    });
    expect(published().filter((message) => message.kind === "source-memory").at(-1)).toMatchObject({
      imageId: "whole-photo",
      sourceIdentity: "https://imagery.test/whole.avif",
      workerMemory: { compositionBytes: 0, decodeCanvasBytes: 0, workingBytes: 0 },
    });
    expect(first!.bitmap!.close).not.toHaveBeenCalled();
    const reads = avifPipeline.drawBBoxTo.mock.calls.length;
    worker.postMessage.mockClear();
    await finish(send(wholeRequest({ ...flags, generation: 2, reusePublished: true })));
    const second = foreground().filter((message) => message.bitmap && message.complete).at(-1);
    expect(second).toMatchObject({
      generation: 2,
      complete: true,
      sourceBackend: "avif-pyramid",
      sourceWidth: 256,
      sourceHeight: 192,
      bitmap: { width: 32, height: 24 },
    });
    expect(second?.reusePublished).toBeUndefined();
    expect(second!.bitmap).not.toBe(first!.bitmap);
    expect(avifPipeline.drawBBoxTo.mock.calls.length).toBeGreaterThan(reads);
    expect(published().filter((message) => message.kind === "source-memory").at(-1)?.workerMemory).toMatchObject({
      compositionBytes: 0, decodeCanvasBytes: 0, workingBytes: 0,
    });
    expect(first!.bitmap!.close).not.toHaveBeenCalled();
    expect(second!.bitmap!.close).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });
  it.each([true, false])("never warms an AVIF URL as a full JPEG when idle arrives before source initialization (only=%s)", async (avifOnly) => {
    configureWholeSource();
    const input = wholeRequest({ tiff: false, avifOnly, activeSourceByteLimit: 1024 * 1024 });
    const pending = send(input);
    // Dynamic import has yielded; no native AVIF source exists yet.
    expect(avifPipeline.construct).not.toHaveBeenCalled();
    await send({ ...input, activity: false });
    await finish(pending);
    await drainPhotoBackground();
    expect(network).not.toHaveBeenCalled();
    expect(avifPipeline.prewarm).toHaveBeenCalledOnce();
    expect(foreground().at(-1)).toMatchObject({ sourceBackend: "avif-pyramid", complete: true });
  });

  it("does not let an aborted idle selection retire a multi-stage foreground surface", async () => {
    const oddNative = { width: px(1025), height: px(769) };
    const baseline: NativePreviewWindow = {
      source: { x: px(0), y: px(0), width: px(1025), height: px(769) },
      target: { width: px(64), height: px(47) },
    };
    const zoomed: NativePreviewWindow = {
      source: { x: px(113), y: px(79), width: px(777), height: px(531) },
      target: { width: px(389), height: px(266) },
    };
    const coarse = { level: 3, getWidth: () => 129, getHeight: () => 97 };
    const fine = { level: 1, getWidth: () => 513, getHeight: () => 385 };
    let foregroundSelection = 0;
    let idleSignal!: AbortSignal;
    let resolveIdle!: (value: { image: typeof fine; refinements: typeof fine[] }) => void;
    const idleSelection = new Promise<{ image: typeof fine; refinements: typeof fine[] }>((resolve) => { resolveIdle = resolve; });
    avifPipeline.select.mockImplementation((_window, _native, signal: AbortSignal, maxPixels: number) => {
      if (maxPixels === 1) { idleSignal = signal; return idleSelection; }
      foregroundSelection++;
      return Promise.resolve(foregroundSelection === 1
        ? { image: fine, refinements: [] } : { image: coarse, refinements: [fine] });
    });
    const flags = { nativeSize: oddNative, releaseCanvasAfterPublish: true, activeSourceByteLimit: 1024 * 1024 };
    await finish(send(wholeRequest({ ...flags, window: baseline })));
    await drainPhotoBackground();
    expect(idleSignal).toBeDefined();
    const originalPaint = avifPipeline.drawBBoxTo.getMockImplementation()!;
    let resumeFine!: () => void;
    const finerPaint = new Promise<void>((resolve) => { resumeFine = resolve; });
    let foregroundSurface!: Canvas;
    avifPipeline.drawBBoxTo.mockImplementation(async (page, bounds, context, destination, signal) => {
      if (page === fine) {
        foregroundSurface = Canvas.instances.find((canvas) => canvas.context === context)!;
        await finerPaint;
      }
      return originalPaint(page, bounds, context, destination, signal);
    });
    worker.postMessage.mockClear();
    const pending = send(wholeRequest({ ...flags, window: zoomed, generation: 2 }));
    await vi.advanceTimersByTimeAsync(5);
    expect(foregroundSurface).toBeDefined();
    expect(foreground()).toHaveLength(1);
    expect(idleSignal.aborted).toBe(true);
    // The old source selection resolves despite cancellation while finer pixels are still pending.
    resolveIdle({ image: fine, refinements: [] });
    for (let step = 0; step < 10; step++) await Promise.resolve();
    expect(foregroundSurface.width).toBe(389);
    expect(foregroundSurface.height).toBe(266);
    await send(wholeRequest({ ...flags, activity: true }));
    resumeFine();
    await finish(pending);
    const frames = foreground().filter((message) => message.bitmap);
    expect(frames).toHaveLength(2);
    expect(frames.map((frame) => [frame.bitmap!.width, frame.bitmap!.height])).toEqual([[389, 266], [389, 266]]);
    expect(frames.map((frame) => frame.crop)).toEqual([zoomed.source, zoomed.source]);
    expect(published().some((message) => message.kind === "prepared-frame")).toBe(false);
  });

  it.each([{ width: 466, height: 700 }, { width: 466, height: 640 }])(
    "keeps in-flight468×703 geometry immutable when activity changes warm view to$width×$height",
    async ({ width, height }) => {
      const portraitNative = { width: px(12736), height: px(19136) };
      const original: NativePreviewWindow = {
        source: { x: px(0), y: px(0), width: portraitNative.width, height: portraitNative.height },
        target: { width: px(468), height: px(703) },
      };
      const warm: NativePreviewWindow = {
        source: { x: px(31), y: px(43), width: px(12500), height: px(18700) },
        target: { width: px(width), height: px(height) },
      };
      const coarse = { level: 7, getWidth: () => 100, getHeight: () => 150 };
      const fine = { level: 4, getWidth: () => 796, getHeight: () => 1196 };
      avifPipeline.select.mockResolvedValue({ image: coarse, refinements: [fine] });
      const originalDecode = decode.getMockImplementation()!;
      let copyStarted = false;
      let releaseCopy!: () => void;
      const copyGate = new Promise<void>((resolve) => { releaseCopy = resolve; });
      decode.mockImplementation(async (input: Blob | Canvas | ImageBitmap, ...args: unknown[]) => {
        if (input instanceof Canvas && !copyStarted) {
          copyStarted = true;
          const captured = { width: input.width, height: input.height };
          await copyGate;
          return makeBitmap(captured.width, captured.height);
        }
        return originalDecode(input, ...args);
      });
      const input = wholeRequest({ nativeSize: portraitNative, window: original,
        releaseCanvasAfterPublish: true, activeSourceByteLimit: 4 * 1024 * 1024 });
      const pending = send(input);
      await vi.advanceTimersByTimeAsync(1);
      expect(copyStarted).toBe(true);
      await send({ ...input, activity: true, warmWindow: warm });
      expect(input.window).toEqual(original);
      expect(input.window.target).toEqual({ width: 468, height: 703 });
      releaseCopy();
      await finish(pending);
      const frames = foreground().filter((frame) => frame.bitmap);
      expect(frames).toHaveLength(2);
      expect(frames.map((frame) => frame.crop)).toEqual([original.source, original.source]);
      expect(frames.map((frame) => [frame.bitmap!.width, frame.bitmap!.height])).toEqual([[468, 703], [468, 703]]);
      expect(frames.map((frame) => frame.complete)).toEqual([false, true]);
      expect(foreground().filter((frame) => frame.error)).toEqual([]);
      await send({ ...input, activity: false });
      await drainPhotoBackground();
      expect(avifPipeline.warmNeighborhood).toHaveBeenCalledWith(warm, portraitNative,
        expect.any(AbortSignal), expect.any(Object));
    }
  );

  it("publishes physical-density foreground pixels before idle prewarming, without a full-image copy", async () => {
    configureWholeSource();
    const order: string[] = [];
    worker.postMessage.mockImplementation((message: Published) => {
      if (message.bitmap) order.push(message.kind ?? "roi");
    });
    avifPipeline.warmNeighborhood.mockImplementation(async () => { order.push("critical-neighborhood"); });
    avifPipeline.prewarmNextLevel.mockImplementation(async () => { order.push("next-level-encoded"); });
    avifPipeline.prewarm.mockImplementation(async () => {
      order.push("encoded-prewarm");
      avifPipeline.residentBytes = 123456;
    });
    await finish(
      send(
        wholeRequest({
          retainWholeImage: false,
          releaseCanvasAfterPublish: true,
          activeSourceByteLimit: 1024 * 1024,
        })
      )
    );
    await drainPhotoBackground();
    expect(order).toEqual([
      "roi", "critical-neighborhood", "prepared-frame", "prepared-frame", "next-level-encoded", "encoded-prewarm",
    ]);
    expect(published().filter((message) => message.kind === "prepared-frame")
      .map((message) => message.preparedDirection)).toEqual(["in", "out"]);
    expect(published().some((message) => message.kind === "full-image")).toBe(
      false
    );
    expect(avifPipeline.prewarm).toHaveBeenCalledWith(
      windowAt(),
      nativeSize,
      expect.any(AbortSignal),
      expect.objectContaining({
        shouldYield: expect.any(Function),
        onProgress: expect.any(Function),
      })
    );
    expect(published().at(-1)).toMatchObject({
      kind: "source-memory",
      sourceResidentBytes: 123456,
      workerMemory: {
        compositionBytes: 0,
        decodeCanvasBytes: 0,
        workingBytes: 0,
      },
    });
    expect(network).not.toHaveBeenCalled();
  });

  it("waits for settled interaction, aborts active idle work, and resumes with the latest crop", async () => {
    configureWholeSource();
    avifPipeline.prewarm.mockImplementation(
      (_window: unknown, _size: unknown, signal: AbortSignal) =>
        new Promise<void>((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          })
        )
    );
    await send(wholeRequest({ activity: true }));
    await finish(send(wholeRequest()));
    expect(avifPipeline.prewarm).not.toHaveBeenCalled();
    await send(wholeRequest({ activity: false }));
    await vi.advanceTimersByTimeAsync(0);
    expect(avifPipeline.prewarm).toHaveBeenCalledOnce();
    const [, , firstSignal, firstOptions] = avifPipeline.prewarm.mock.calls[0];
    expect(firstOptions.shouldYield()).toBe(false);
    const warmWindow = windowAt(40, 30, 80);
    await send(wholeRequest({ activity: true, warmWindow }));
    expect(firstSignal.aborted).toBe(true);
    expect(firstOptions.shouldYield()).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(avifPipeline.prewarm).toHaveBeenCalledOnce();
    await send(wholeRequest({ activity: false }));
    await vi.advanceTimersByTimeAsync(600);
    expect(avifPipeline.prewarm).toHaveBeenCalledTimes(2);
    expect(avifPipeline.prewarm.mock.calls[1][0]).toEqual(warmWindow);
  });

  it("does not let an aborted old task complete or reset a newer warm task", async () => {
    configureWholeSource();
    const resolutions: Array<() => void> = [];
    avifPipeline.prewarm.mockImplementation(
      () => new Promise<void>((resolve) => resolutions.push(resolve))
    );
    await finish(send(wholeRequest()));
    await drainPhotoBackground();
    const signal = avifPipeline.prewarm.mock.calls[0][2] as AbortSignal;
    await finish(
      send(wholeRequest({ window: windowAt(32, 24, 128), generation: 2 }))
    );
    await drainPhotoBackground();
    expect(signal.aborted).toBe(true);
    expect(avifPipeline.prewarm).toHaveBeenCalledTimes(2);
    const before = published().length;
    resolutions[0]();
    await drainPhotoBackground();
    expect(published()).toHaveLength(before);
    await send({ budgetOnly: true, activeSourceByteLimit: 4096 });
    expect(avifPipeline.prewarm).toHaveBeenCalledTimes(2);
    expect((avifPipeline.prewarm.mock.calls[1][2] as AbortSignal).aborted).toBe(
      false
    );
    resolutions[1]();
    await drainPhotoBackground();
    expect(published().at(-1)?.kind).toBe("source-memory");
  });

  it.each(["park", "source change"])(
    "cancels idle reads on %s",
    async (mode) => {
      configureWholeSource();
      avifPipeline.prewarm.mockImplementation(
        (_window: unknown, _size: unknown, signal: AbortSignal) =>
          new Promise<void>((_resolve, reject) =>
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            })
          )
      );
      await finish(send(wholeRequest()));
      await drainPhotoBackground();
      const signal = avifPipeline.prewarm.mock.calls[0][2] as AbortSignal;
      if (mode === "park") {
        await send(
          wholeRequest({
            park: true,
            generation: 2,
            retainedSourceByteLimit: 8192,
          })
        );
        expect(avifPipeline.park).toHaveBeenCalledWith(8192);
        expect(published().at(-1)).toMatchObject({
          kind: "source-memory",
          imageId: "whole-photo",
          workerMemory: {
            compositionBytes: 32 * 24 * 4,
            decodeCanvasBytes: 0,
            workingBytes: 0,
          },
        });
      } else {
        await finish(
          send(
            wholeRequest({
              url: "https://imagery.test/next.avif",
              avifPyramidUrl: "https://imagery.test/next.avif",
              imageId: "next-photo",
              sourceIdentity: "https://imagery.test/next.avif",
              generation: 2,
            })
          )
        );
        expect(avifPipeline.close).toHaveBeenCalledOnce();
      }
      expect(signal.aborted).toBe(true);
    }
  );

  it("reuses foreground pixels and completed warming without another bitmap or tile decode", async () => {
    configureWholeSource();
    await finish(send(wholeRequest()));
    await drainPhotoBackground();
    const decodes = decode.mock.calls.length,
      reads = avifPipeline.drawBBoxTo.mock.calls.length;
    await finish(send(wholeRequest({ generation: 2, reusePublished: true })));
    await drainPhotoBackground();
    expect(decode).toHaveBeenCalledTimes(decodes);
    expect(avifPipeline.drawBBoxTo).toHaveBeenCalledTimes(reads);
    expect(avifPipeline.prewarm).toHaveBeenCalledOnce();
    expect(published().at(-1)).toMatchObject({
      generation: 2,
      reusePublished: true,
    });
  });

  it("decodes continued-pan pixels after actual viewport children and before the remaining pyramid", async () => {
    configureWholeSource();
    const flags = { activeSourceByteLimit: 1024 * 1024, releaseCanvasAfterPublish: true };
    await finish(send(wholeRequest(flags)));
    const next = windowAt(32, 24, 80);
    await send(wholeRequest({ ...flags, activity: true, warmWindow: next }));
    await drainPhotoBackground();
    expect(avifPipeline.warmNeighborhood).toHaveBeenCalledWith(next, nativeSize,
      expect.any(AbortSignal), expect.any(Object));
    expect(avifPipeline.warmVisibleDecoded).toHaveBeenCalledWith({
      source: { ...next.source, x: 96 }, target: next.target,
    }, nativeSize, expect.any(AbortSignal), expect.any(Object));
    expect(avifPipeline.warmNeighborhood.mock.invocationCallOrder[0])
      .toBeLessThan(avifPipeline.warmVisibleDecoded.mock.invocationCallOrder[0]);
    expect(avifPipeline.warmVisibleDecoded.mock.invocationCallOrder[0])
      .toBeLessThan(avifPipeline.prewarmNextLevel.mock.invocationCallOrder[0]);
    expect(avifPipeline.prewarmNextLevel.mock.invocationCallOrder[0])
      .toBeLessThan(avifPipeline.prewarm.mock.invocationCallOrder[0]);
  });

  it("retries failed idle warming on the next settled interaction", async () => {
    configureWholeSource();
    avifPipeline.prewarm.mockRejectedValueOnce(
      new Error("temporary range failure")
    );
    await finish(send(wholeRequest()));
    await drainPhotoBackground();
    expect(avifPipeline.prewarm).toHaveBeenCalledOnce();
    await send(wholeRequest({ activity: false }));
    await drainPhotoBackground();
    expect(avifPipeline.prewarm).toHaveBeenCalledTimes(2);
    expect(published().filter((message) => message.error)).toEqual([]);
  });
});

it("reuses decoded JPEG source for a bounded whole fallback with accurate identity and resident bytes", async () => {
  const largerNative = { width: px(4096), height: px(3072) },
    originalDecode = decode.getMockImplementation()!;
  decode.mockImplementation(
    async (input: Blob | Canvas | ImageBitmap, ...args: unknown[]) => {
      if (input instanceof Blob) {
        const level = levelOf(await input.text());
        return makeBitmap(
          largerNative.width / 2 ** level,
          largerNative.height / 2 ** level
        );
      }
      return originalDecode(input, ...args);
    }
  );
  await finish(
    send(
      request({
        nativeSize: largerNative,
        retainWholeImage: true,
        imageId: "jpeg-photo",
        sourceIdentity: "https://imagery.test/photo.jpg",
      })
    )
  );
  const overviews = published().filter((message) => message.kind === "full-image");
  const full = overviews.at(-1)!;
  expect(overviews.map((message) => message.bitmap!.width)).toEqual([64, 128, 256, 512]);
  expect(overviews.every((message) => Math.max(message.bitmap!.width, message.bitmap!.height) <= 1024)).toBe(true);
  expect(full).toMatchObject({
    imageId: "jpeg-photo",
    sourceIdentity: "https://imagery.test/photo.jpg",
    sourceBackend: "jpeg",
    sourceWidth: 512,
    sourceHeight: 384,
    // The decoded JPEG and its protected overview are separate owned bitmaps.
    sourceResidentBytes: 2 * 512 * 384 * 4,
    crop: { x: 0, y: 0, width: 4096, height: 3072 },
  });
  expect(full.bitmap!.width).toBe(512);
  expect(full.bitmap!.height).toBe(384);
  const foregroundFrames = published().filter(
    (message) => message.kind === undefined && message.bitmap
  );
  expect(foregroundFrames.at(-1)).toMatchObject({
    complete: true,
    sourceResidentBytes: 2 * 512 * 384 * 4,
  });
  // Overview publication precedes the matching ROI and improves with it.
  expect(published().indexOf(full)).toBeLessThan(
    published().indexOf(foregroundFrames.at(-1)!)
  );
  expect(network.mock.calls.map(([asset]) => levelOf(asset))).toEqual([
    6, 5, 4, 3,
  ]);
  await drainPhotoBackground();
  expect(network.mock.calls.map(([asset]) => levelOf(asset))).toEqual([6, 5, 4, 3, 2]);
  expect(
    decode.mock.calls.filter(([input]) => input instanceof Blob)
  ).toHaveLength(4);
  expect(avifPipeline.prewarm).not.toHaveBeenCalled();
});

describe("sharp resident preview admission", () => {
  it("publishes a uniform decoded parent before target work without waiting on local inventory", async () => {
    const initial = { level: 5, entry: { scale: 1 / 32 }, getWidth: () => 16, getHeight: () => 12 };
    const parent = { level: 2, entry: { scale: 1 / 4 }, getWidth: () => 128, getHeight: () => 96 };
    const target = { level: 1, entry: { scale: 1 / 2 }, getWidth: () => 256, getHeight: () => 192 };
    avifPipeline.select.mockResolvedValue({ image: initial, refinements: [parent, target] });
    avifPipeline.availablePage.mockReturnValue(parent);
    avifPipeline.ensureLocalAvailability.mockImplementation(() => new Promise(() => {}));
    await finish(send(wholeRequest({ retainWholeImage: false })));
    expect(avifPipeline.ensureLocalAvailability).not.toHaveBeenCalled();
    expect(avifPipeline.drawBBoxTo.mock.calls.map(([page]) => page)).toEqual([parent, target]);
    expect(foreground().map((message) => message.sourceLevel)).toEqual([2, 1]);
    expect(foreground().map((message) => message.complete)).toEqual([false, true]);
    expect(avifPipeline.drawBBoxTo.mock.calls.map(([, , , destination]) => destination)).toEqual([
      { x: 0, y: 0, width: 32, height: 24 }, { x: 0, y: 0, width: 32, height: 24 },
    ]);
  });

  it("decodes a locally compressed direct parent before fetching an unavailable target", async () => {
    const initial = { level: 4, entry: { scale: 1 / 16 }, getWidth: () => 32, getHeight: () => 24 };
    const parent = { level: 2, entry: { scale: 1 / 4 }, getWidth: () => 128, getHeight: () => 96 };
    const target = { level: 1, entry: { scale: 1 / 2 }, getWidth: () => 256, getHeight: () => 192 };
    avifPipeline.select.mockResolvedValue({ image: initial, refinements: [parent, target] });
    avifPipeline.hasLocallyAvailable.mockImplementation((page) => page === parent);
    await finish(send(wholeRequest({ retainWholeImage: false, window: windowAt(128, 96) })));
    expect(avifPipeline.drawBBoxTo.mock.calls.map(([page]) => page)).toEqual([parent, target]);
    expect(foreground().map((message) => message.sourceLevel)).toEqual([2, 1]);
    expect(foreground().map((message) => message.complete)).toEqual([false, true]);
    expect(avifPipeline.drawBBoxTo.mock.calls.map(([, , , destination]) => destination)).toEqual([
      { x: 0, y: 0, width: 128, height: 96 }, { x: 0, y: 0, width: 128, height: 96 },
    ]);
    expect(network).not.toHaveBeenCalled();
  });

  it("uses a fully decoded target immediately without replaying coarser levels", async () => {
    const initial = { level: 4, entry: { scale: 1 / 16 }, getWidth: () => 32, getHeight: () => 24 };
    const target = { level: 1, entry: { scale: 1 / 2 }, getWidth: () => 256, getHeight: () => 192 };
    avifPipeline.select.mockResolvedValue({ image: initial, refinements: [target] });
    avifPipeline.availablePage.mockReturnValue(target);
    await finish(send(wholeRequest({ retainWholeImage: false })));
    expect(avifPipeline.ensureLocalAvailability).not.toHaveBeenCalled();
    expect(avifPipeline.drawBBoxTo).toHaveBeenCalledTimes(1);
    expect(foreground()).toHaveLength(1);
    expect(foreground()[0]).toMatchObject({ sourceLevel: 1, complete: true });
  });

  it("refreshes expired local inventory before deciding to replay coarse frames", async () => {
    const initial = { level: 3, getWidth: () => 64, getHeight: () => 48 },
      fine = { level: 1, getWidth: () => 256, getHeight: () => 192 };
    avifPipeline.select.mockResolvedValue({ image: initial, refinements: [fine] });
    let fresh = false;
    avifPipeline.ensureLocalAvailability.mockImplementation(async () => { fresh = true; });
    avifPipeline.hasLocallyAvailable.mockImplementation((page: unknown) => fresh && page === fine);
    await finish(send(wholeRequest({ retainWholeImage: false })));
    expect(avifPipeline.ensureLocalAvailability).toHaveBeenCalledOnce();
    expect(avifPipeline.drawBBoxTo.mock.calls.map(([page]) => page)).toEqual([fine]);
    expect(foreground().map((message) => message.sourceLevel)).toEqual([1]);
    expect(network).not.toHaveBeenCalled();
  });
  it("composes directly at final display density when its encoded ROI is local but not decoded", async () => {
    const initial = { level: 3, getWidth: () => 64, getHeight: () => 48 },
      fine = { level: 1, getWidth: () => 256, getHeight: () => 192 };
    avifPipeline.select.mockResolvedValue({
      image: initial,
      refinements: [fine],
    });
    avifPipeline.hasCached.mockReturnValue(false);
    avifPipeline.hasLocallyAvailable.mockImplementation(
      (page: unknown, bounds: number[]) =>
        page === fine &&
        bounds[2] - bounds[0] > 1 &&
        bounds[3] - bounds[1] > 1
    );
    await finish(send(wholeRequest({ retainWholeImage: false })));
    expect(avifPipeline.hasLocallyAvailable).toHaveBeenCalledWith(
      fine,
      [31, 15, 161, 113]
    );
    expect(avifPipeline.drawBBoxTo.mock.calls.map(([page]) => page)).toEqual([fine]);
    expect(foreground().map((message) => message.sourceWidth)).toEqual([256]);
    expect(foreground().map((message) => message.complete)).toEqual([true]);
    expect(foreground()[0]).toMatchObject({
      sourceBackend: "avif-pyramid",
      sourceLevel: 1,
      sourceWidth: 256,
      sourceHeight: 192,
    });
    expect(network).not.toHaveBeenCalled();
    const reads = avifPipeline.drawBBoxTo.mock.calls.length;
    await finish(
      send(
        wholeRequest({
          retainWholeImage: false,
          generation: 2,
          reusePublished: true,
        })
      )
    );
    expect(foreground().at(-1)).toMatchObject({
      reusePublished: true,
      sourceBackend: "avif-pyramid",
      sourceLevel: 1,
      sourceWidth: 256,
      sourceHeight: 192,
    });
    expect(avifPipeline.drawBBoxTo).toHaveBeenCalledTimes(reads);
  });
  it("preserves coarse stages when only the visible encoded crop is local and its linear sampling guard is missing", async () => {
    const initial = { level: 3, getWidth: () => 64, getHeight: () => 48 },
      fine = { level: 1, getWidth: () => 256, getHeight: () => 192 };
    avifPipeline.select.mockResolvedValue({
      image: initial,
      refinements: [fine],
    });
    avifPipeline.hasLocallyAvailable.mockImplementation(
      (page: unknown, bounds: number[]) =>
        page === fine &&
        bounds[0] >= 32 &&
        bounds[1] >= 16 &&
        bounds[2] <= 160 &&
        bounds[3] <= 112
    );
    await finish(send(wholeRequest({ retainWholeImage: false })));
    expect(avifPipeline.hasLocallyAvailable).toHaveBeenCalledWith(
      fine,
      [31, 15, 161, 113]
    );
    expect(avifPipeline.drawBBoxTo.mock.calls.map(([page]) => page)).toEqual([
      initial,
      fine,
    ]);
    expect(foreground().map((message) => message.complete)).toEqual([
      false,
      true,
    ]);
  });
  it("starts directly at the sharpest fully cached AVIF guarded ROI without a native probe", async () => {
    const initial = { level: 3, getWidth: () => 64, getHeight: () => 48 },
      fine = { level: 1, getWidth: () => 256, getHeight: () => 192 };
    avifPipeline.select.mockResolvedValue({
      image: initial,
      refinements: [fine],
    });
    avifPipeline.hasCached.mockReturnValue(true);
    await finish(send(wholeRequest({ retainWholeImage: false })));
    expect(avifPipeline.drawBBoxTo.mock.calls.map(([page]) => page)).toEqual([fine]);
    expect(foreground().map((message) => message.sourceWidth)).toEqual([256]);
    expect(foreground()[0]).toMatchObject({
      complete: true,
      sourceBackend: "avif-pyramid",
    });
    expect(
      avifPipeline.hasCached.mock.calls.some(
        ([page, bounds]) =>
          page === fine &&
          bounds[2] - bounds[0] > 1 &&
          bounds[3] - bounds[1] > 1
      )
    ).toBe(true);
  });
  it("preserves progressive stages when only the native probe is cached and the guard is incomplete", async () => {
    const initial = { level: 3, getWidth: () => 64, getHeight: () => 48 },
      fine = { level: 1, getWidth: () => 256, getHeight: () => 192 };
    avifPipeline.select.mockResolvedValue({
      image: initial,
      refinements: [fine],
    });
    avifPipeline.hasCached.mockImplementation(
      (_page: unknown, bounds: number[]) =>
        bounds[2] - bounds[0] === 1 && bounds[3] - bounds[1] === 1
    );
    await finish(send(wholeRequest({ retainWholeImage: false })));
    expect(avifPipeline.drawBBoxTo.mock.calls.map(([page]) => page)).toEqual([
      initial,
      fine,
    ]);
    expect(foreground().map((message) => message.sourceWidth)).toEqual([
      64, 256,
    ]);
    expect(foreground().map((message) => message.complete)).toEqual([
      false,
      true,
    ]);
  });
  it("reports actual decoded JPEG bytes during published-composition reuse without bitmap work", async () => {
    await finish(send(request()));
    const decodes = decode.mock.calls.length,
      gets = network.mock.calls.length;
    await finish(send(request({ generation: 2, reusePublished: true })));
    expect(published().at(-1)).toMatchObject({
      generation: 2,
      reusePublished: true,
      sourceResidentBytes: 64 * 48 * 4,
    });
    expect(published().at(-1)?.bitmap).toBeUndefined();
    expect(decode).toHaveBeenCalledTimes(decodes);
    expect(network).toHaveBeenCalledTimes(gets);
  });
});
