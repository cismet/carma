// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DevicePixels } from "@carma-units";
import type { NativePreviewWindow } from "../../core/utils/native-preview-window";
import { TiffPreviewSource } from "./tiff-preview-source";

const transport = vi.hoisted(() => ({
  fromCustomClient: vi.fn(),
  getImage: vi.fn(),
}));
vi.mock("geotiff", () => ({
  addDecoder: vi.fn(),
  BaseClient: class {
    constructor(readonly url: string) {}
  },
  BaseResponse: class {},
  fromCustomClient: transport.fromCustomClient,
}));
vi.mock("@jsquash/jpeg/decode.js", () => ({
  default: vi.fn(),
  init: vi.fn(),
}));
vi.mock("@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm?url", () => ({
  default: "mock-jpeg-decoder.wasm",
}));

const nativeSize = {
  width: 8192 as DevicePixels,
  height: 6144 as DevicePixels,
};
const previewWindow = (targetWidth: number, targetHeight: number) =>
  ({
    source: { x: 1024, y: 512, width: 4096, height: 3072 },
    target: { width: targetWidth, height: targetHeight },
  } as NativePreviewWindow);
const directoryValues: Record<string, number> = {
  Orientation: 1,
  Compression: 7,
  Predictor: 1,
  PlanarConfiguration: 1,
  PhotometricInterpretation: 2,
};
const pages = (factors = [1, 2, 4, 8]) =>
  factors.map((factor, index) => ({
    fileDirectory: {
      nextIFDByteOffset: index === factors.length - 1 ? 0 : index + 1,
      loadValue: vi.fn(async (name: string) =>
        name === "BitsPerSample" ? [8, 8, 8] : undefined
      ),
      getValue: (name: string) => directoryValues[name],
    },
    getWidth: () => nativeSize.width / factor,
    getHeight: () => nativeSize.height / factor,
    getSamplesPerPixel: () => 3,
    readRasters: vi.fn(),
  }));

beforeEach(() => {
  vi.clearAllMocks();
  transport.fromCustomClient.mockResolvedValue({
    getImage: transport.getImage,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("TIFF-selection tests must not perform HTTP requests");
    })
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("TIFF preview overview selection", () => {
  it("propagates low background priority through bounded TIFF metadata byte ranges", async () => {
    const images = pages();
    transport.getImage.mockImplementation(
      async (index: number) => images[index]
    );
    const network = vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 206,
          headers: { "Content-Range": "bytes 0-3/100", "Content-Length": "4" },
        })
    );
    vi.stubGlobal("fetch", network);
    transport.fromCustomClient.mockImplementationOnce(
      async (client: {
        request: (
          options: RequestInit
        ) => Promise<{ getData: () => Promise<ArrayBuffer> }>;
      }) => {
        expect(new Headers({ Range: "bytes=0-3" }).get("Range")).toBe(
          "bytes=0-3"
        );
        const response = await client.request({
          headers: { Range: "bytes=0-3" },
        });
        expect(new Uint8Array(await response.getData())).toEqual(
          new Uint8Array([1, 2, 3, 4])
        );
        return { getImage: transport.getImage };
      }
    );
    const controller = new AbortController();
    await new TiffPreviewSource(
      "https://imagery.test/background.tif",
      64 * 1024,
      "low"
    ).select(previewWindow(1024, 768), nativeSize, controller.signal);
    expect(network).toHaveBeenCalledOnce();
    expect(network).toHaveBeenCalledWith(
      "https://imagery.test/background.tif",
      {
        headers: { Range: "bytes=0-3" },
        signal: controller.signal,
        priority: "low",
      }
    );
    for (const image of images)
      expect(image.readRasters).not.toHaveBeenCalled();
  });

  it("starts exactly at the eight-display-pixel cap and includes every finer page in order", async () => {
    const images = pages([1, 2, 4, 8, 16, 32, 64]);
    transport.getImage.mockImplementation(
      async (index: number) => images[index]
    );
    const source = new TiffPreviewSource("https://imagery.test/photo.tif");
    const window = previewWindow(1024, 768);
    const result = await source.select(
      window,
      nativeSize,
      new AbortController().signal,
      8
    );
    expect(result.image).toBe(images[5]);
    expect(
      window.target.width /
        ((window.source.width * result.image.getWidth()) / nativeSize.width)
    ).toBe(8);
    expect(
      window.target.height /
        ((window.source.height * result.image.getHeight()) / nativeSize.height)
    ).toBe(8);
    expect(result.refinements).toEqual([
      images[4],
      images[3],
      images[2],
      images[1],
      images[0],
    ]);
    expect(transport.getImage.mock.calls.map(([index]) => index)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    for (const image of images)
      expect(image.readRasters).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { width: 1025, height: 768, factor: 16 },
    { width: 512, height: 1536, factor: 16 },
    { width: 2048, height: 384, factor: 16 },
  ])(
    "respects the stricter physical axis at $width x $height without exceeding the cap",
    async ({ width, height, factor }) => {
      const images = pages([1, 2, 4, 8, 16, 32, 64]);
      transport.getImage.mockImplementation(
        async (index: number) => images[index]
      );
      const source = new TiffPreviewSource("https://imagery.test/photo.tif");
      const window = previewWindow(width, height);
      const result = await source.select(
        window,
        nativeSize,
        new AbortController().signal,
        8
      );
      expect(result.image.getWidth()).toBe(nativeSize.width / factor);
      expect(result.image.getHeight()).toBe(nativeSize.height / factor);
      expect(width / (window.source.width / factor)).toBeLessThanOrEqual(8);
      expect(height / (window.source.height / factor)).toBeLessThanOrEqual(8);
      expect(result.refinements.at(-1)).toBe(images[0]);
      for (const image of images)
        expect(image.readRasters).not.toHaveBeenCalled();
    }
  );

  it("uses the already physical target dimensions without applying device pixel ratio twice", async () => {
    vi.stubGlobal("devicePixelRatio", 4);
    const images = pages([1, 2, 4, 8, 16, 32, 64]);
    transport.getImage.mockImplementation(
      async (index: number) => images[index]
    );
    const source = new TiffPreviewSource("https://imagery.test/photo.tif");
    // The caller already turned a 1024x768 CSS crop at DPR 2 into 2048x1536 device pixels.
    const result = await source.select(
      previewWindow(2048, 1536),
      nativeSize,
      new AbortController().signal,
      8
    );
    expect(result.image).toBe(images[4]);
    expect(result.refinements).toEqual([
      images[3],
      images[2],
      images[1],
      images[0],
    ]);
    expect(fetch).not.toHaveBeenCalled();
    for (const image of images)
      expect(image.readRasters).not.toHaveBeenCalled();
  });

  it("starts at the physical-pixel matching overview and refines through every finer page to the original", async () => {
    const images = pages();
    transport.getImage.mockImplementation(
      async (index: number) => images[index]
    );
    const source = new TiffPreviewSource("https://imagery.test/photo.tif");
    const result = await source.select(
      previewWindow(1024, 768),
      nativeSize,
      new AbortController().signal
    );
    expect(result.image).toBe(images[2]);
    expect(result.refinements).toEqual([images[1], images[0]]);
    expect(transport.getImage.mock.calls.map(([index]) => index)).toEqual([
      0, 1, 2, 3,
    ]);
    for (const image of images)
      expect(image.readRasters).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads only the original for export and does not refine an already native-resolution preview", async () => {
    const images = pages();
    transport.getImage.mockImplementation(
      async (index: number) => images[index]
    );
    const source = new TiffPreviewSource("https://imagery.test/photo.tif");
    const signal = new AbortController().signal;
    expect(await source.native(nativeSize, signal)).toBe(images[0]);
    expect(transport.getImage).toHaveBeenCalledOnce();
    expect(transport.getImage).toHaveBeenCalledWith(0);
    const result = await source.select(
      previewWindow(4096, 3072),
      nativeSize,
      signal
    );
    expect(result.image).toBe(images[0]);
    expect(result.refinements).toEqual([]);
    for (const image of images)
      expect(image.readRasters).not.toHaveBeenCalled();
  });

  it("stops inspecting overviews when the request is aborted during metadata loading", async () => {
    const images = pages();
    const controller = new AbortController();
    const failure = new DOMException("Preview cancelled", "AbortError");
    transport.getImage.mockImplementation(async (index: number) => {
      if (index === 1) controller.abort(failure);
      return images[index];
    });
    const source = new TiffPreviewSource("https://imagery.test/photo.tif");
    await expect(
      source.select(previewWindow(1024, 768), nativeSize, controller.signal)
    ).rejects.toBe(failure);
    expect(transport.getImage.mock.calls.map(([index]) => index)).toEqual([
      0, 1,
    ]);
    for (const image of images)
      expect(image.readRasters).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
