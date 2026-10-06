// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DevicePixels } from "@carma-units";
import type { PreviewQualityLevel } from "../../core/constants";
import type { NativePreviewWindow } from "../../core/utils/native-preview-window";

const pipeline = vi.hoisted(() => ({
  construct: vi.fn(),
  select: vi.fn(),
  read: vi.fn(),
  resample: vi.fn(),
}));
const avifPipeline = vi.hoisted(() => ({
  select: vi.fn(),
  read: vi.fn(),
  close: vi.fn(),
  park: vi.fn(),
}));
vi.mock("../integrations/avif-pyramid-preview-source", () => ({
  AvifPyramidPreviewSource: class {
    constructor(readonly url: string) {}
    select = avifPipeline.select;
    read = avifPipeline.read;
    close = avifPipeline.close;
    park = avifPipeline.park;
  },
}));
vi.mock("../integrations/tiff-preview-source", () => ({
  TiffPreviewSource: class {
    constructor(readonly url: string, budget?: number, priority?: string) {
      pipeline.construct(url, budget, priority);
    }
    select = pipeline.select;
    read = pipeline.read;
  },
}));
vi.mock("../../core/utils/resample-preview-rgb", () => ({
  resamplePreviewRgb: pipeline.resample,
}));

type Request = {
  url: string;
  window: NativePreviewWindow;
  nativeSize: { width: DevicePixels; height: DevicePixels };
  flipForTexture: boolean;
  minimumQualityLevel?: PreviewQualityLevel;
  maxInitialDisplayPixelSize?: number;
  refineToNative?: boolean;
  priority?: "low" | "high" | "auto";
  generation: number;
  tiff?: boolean;
  avifPyramidUrl?: string;
  cancel?: boolean;
};
type Published = {
  bitmap?: ImageBitmap;
  generation: number;
  sourceWidth?: number;
  sourceHeight?: number;
  complete?: boolean;
  error?: string;
  sourceBackend?: string;
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
    drawImage: vi.fn(),
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
  match: vi.fn(async (key: globalThis.Request) =>
    storage.get(key.url)?.clone()
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
const send = (value: Request) =>
  worker.onmessage!({ data: value } as MessageEvent<Request>);
const finish = async (pending: Promise<void>) => {
  let settled = false;
  void pending.finally(() => {
    settled = true;
  });
  for (let step = 0; step < 40 && !settled; step++) {
    await Promise.resolve();
    await vi.runAllTimersAsync();
  }
  expect(settled).toBe(true);
  await pending;
};
const levelOf = (value: string) =>
  Number(new URL(value).pathname.match(/\/([0-6])\/[^/]+$/)![1]);
const seed = (level: PreviewQualityLevel) => {
  const value = new URL(url);
  value.pathname = value.pathname.replace("/3/", "/" + level + "/");
  storage.set(value.href, new Response(new Blob([value.href])));
};

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
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
      return makeBitmap(args[2] as number, args[3] as number);
    }
  );
  vi.stubGlobal("createImageBitmap", decode);
  pipeline.resample.mockImplementation(
    (_data, _width, _height, width: number, height: number) =>
      new Uint8ClampedArray(width * height * 4)
  );
  pipeline.read.mockResolvedValue(new Uint8ClampedArray([32, 64, 96, 255]));
  pipeline.select.mockReset();
  avifPipeline.select.mockReset();
  avifPipeline.read.mockResolvedValue(new Uint8ClampedArray([32, 64, 96, 255]));
  await import("./preview-rgb.worker");
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("worker-owned progressive image pyramid", () => {
  it("publishes every JPEG refinement from the exact eight-display-pixel cap through the configured minimum", async () => {
    await finish(send(request()));
    expect(network.mock.calls.map(([asset]) => levelOf(asset))).toEqual([
      6, 5, 4, 3, 2, 1,
    ]);
    expect(
      network.mock.calls.every(
        ([asset]) => new URL(asset).search === "?signature=opaque"
      )
    ).toBe(true);
    expect(published().map((value) => value.sourceWidth)).toEqual([
      8, 16, 32, 64, 128, 256,
    ]);
    expect(published().map((value) => value.sourceHeight)).toEqual([
      6, 12, 24, 48, 96, 192,
    ]);
    expect(published().map((value) => value.complete)).toEqual([
      false,
      false,
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
    expect(pipeline.resample).toHaveBeenCalledTimes(6);
    expect(globalThis.Image).not.toHaveBeenCalled();
    expect(typeof document).toBe("undefined");
    expect(Canvas.instances).toHaveLength(2); // one crop plus one reusable decode surface
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
    expect(cache.match).toHaveBeenCalledOnce();
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
    expect(published().map((value) => value.sourceWidth)).toEqual([256]);
    expect(network).toHaveBeenCalledTimes(downloads);
    expect(
      decode.mock.calls.filter(([input]) => input instanceof Blob)
    ).toHaveLength(decoded);
    const compositions = pipeline.resample.mock.calls.length;
    worker.postMessage.mockClear();
    await finish(
      send(request({ generation: 3, window: windowAt(32, 24, 128) }))
    );
    expect(published()).toHaveLength(1);
    expect(published()[0]).toMatchObject({ generation: 3, sourceWidth: 256 });
    expect(pipeline.resample).toHaveBeenCalledTimes(compositions);
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
    await finish(send(request({ generation: 2 })));
    expect(published().at(-1)).toMatchObject({
      generation: 2,
      sourceWidth: 256,
      complete: true,
    });
    expect(network.mock.calls.map(([asset]) => levelOf(asset))).toEqual([2, 1]);
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
    expect(published().map((value) => value.sourceBackend)).toEqual([
      "avif-pyramid",
      "avif-pyramid",
    ]);
    expect(published().map((value) => value.complete)).toEqual([false, true]);
    expect(pipeline.select).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
    expect(avifPipeline.read).toHaveBeenCalledTimes(3); // one required-cell native probe, then the two ROI stages
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
      expect(published().at(-1)?.sourceBackend).toBe("avif-pyramid");
      expect(avifPipeline.select).toHaveBeenCalledTimes(2);
      expect(pipeline.select).toHaveBeenCalledOnce();
    } finally {
      clock.mockRestore();
    }
  });
});
