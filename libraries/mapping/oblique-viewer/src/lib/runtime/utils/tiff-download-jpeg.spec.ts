import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTiffDownloadJpeg } from "./tiff-download-jpeg";
import type { TiffDownloadRequest } from "./tiff-download-types";

const mocks = vi.hoisted(() => ({
  native: vi.fn(),
  read: vi.fn(),
  source: vi.fn(),
}));
vi.mock("@carma-commons/image-pyramid", () => ({
  createTiffPreviewSource: async (url: string) => {
    mocks.source(url);
    return { native: mocks.native, read: mocks.read };
  },
}));

class ExportCanvas {
  static instances: ExportCanvas[] = [];
  context = {
    putImageData: vi.fn(),
    drawImage: vi.fn(),
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
  };
  getContext = vi.fn(() => this.context);
  convertToBlob = vi.fn(async () => new Blob(["jpeg"], { type: "image/jpeg" }));
  constructor(public width: number, public height: number) {
    ExportCanvas.instances.push(this);
  }
}
const request: TiffDownloadRequest = {
  url: "https://images.example/photo.tif",
  nativeSize: { width: 8, height: 600 },
  watermark: {
    imageUrl: "https://images.example/watermark.png",
    position: "bottom-right",
    opacity: 0.5,
    marginPx: 1,
  },
};

describe("full native TIFF JPG composition", () => {
  let artwork: {
    width: number;
    height: number;
    close: ReturnType<typeof vi.fn>;
  };
  beforeEach(() => {
    vi.clearAllMocks();
    ExportCanvas.instances = [];
    mocks.native.mockResolvedValue({ native: true });
    mocks.read.mockImplementation(
      async (_image, window: number[]) =>
        new Uint8ClampedArray(
          (window[2] - window[0]) * (window[3] - window[1]) * 4
        )
    );
    artwork = { width: 2, height: 2, close: vi.fn() };
    vi.stubGlobal("OffscreenCanvas", ExportCanvas);
    vi.stubGlobal(
      "ImageData",
      class {
        constructor(
          public data: Uint8ClampedArray,
          public width: number,
          public height: number
        ) {}
      }
    );
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(artwork));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers(),
        blob: async () => new Blob(["artwork"], { type: "image/png" }),
      })
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reads only the native page in bounded strips and burns artwork before encoding", async () => {
    const signal = new AbortController().signal;
    const blob = await createTiffDownloadJpeg(request, signal);
    expect(mocks.source).toHaveBeenCalledWith(request.url);
    expect(mocks.native).toHaveBeenCalledWith(request.nativeSize, signal);
    expect(mocks.read.mock.calls.map((call) => call[1])).toEqual([
      [0, 0, 8, 256],
      [0, 256, 8, 512],
      [0, 512, 8, 600],
    ]);
    const canvas = ExportCanvas.instances[0];
    expect(canvas.context.putImageData).toHaveBeenCalledTimes(3);
    expect(canvas.context.drawImage).toHaveBeenCalledWith(
      artwork,
      5,
      597,
      2,
      2
    );
    expect(
      canvas.context.drawImage.mock.invocationCallOrder[0]
    ).toBeGreaterThan(canvas.context.putImageData.mock.invocationCallOrder[2]);
    expect(canvas.convertToBlob.mock.invocationCallOrder[0]).toBeGreaterThan(
      canvas.context.drawImage.mock.invocationCallOrder[0]
    );
    expect(canvas.convertToBlob).toHaveBeenCalledWith({
      type: "image/jpeg",
      quality: 0.95,
    });
    expect(blob.type).toBe("image/jpeg");
    expect(artwork.close).toHaveBeenCalledOnce();
    expect([canvas.width, canvas.height]).toEqual([1, 1]);
  });

  it("resolves configured artwork size and centered placement in native pixels", async () => {
    await createTiffDownloadJpeg(
      {
        ...request,
        watermark: {
          ...request.watermark,
          position: "center",
          widthFraction: 0.5,
        },
      },
      new AbortController().signal
    );
    expect(ExportCanvas.instances[0].context.drawImage).toHaveBeenCalledWith(
      artwork,
      2,
      298,
      4,
      4
    );
  });

  it("matches the publisher's northwest screen caption without scaling the artwork", async () => {
    let composition: string | undefined;
    let alpha: number | undefined;
    // Capture the blend at draw time, before the compositor restores its defaults.
    vi.stubGlobal(
      "OffscreenCanvas",
      class extends ExportCanvas {
        constructor(width: number, height: number) {
          super(width, height);
          this.context.drawImage.mockImplementation(() => {
            composition = this.context.globalCompositeOperation;
            alpha = this.context.globalAlpha;
          });
        }
      }
    );
    await createTiffDownloadJpeg(
      {
        ...request,
        nativeSize: { width: 800, height: 600 },
        watermark: {
          ...request.watermark,
          position: "top-left",
          marginPx: 6,
          opacity: 1,
          blend: "screen",
        },
      },
      new AbortController().signal
    );
    const canvas = ExportCanvas.instances[0];
    expect(canvas.context.drawImage).toHaveBeenCalledWith(artwork, 6, 6, 2, 2);
    expect(composition).toBe("screen");
    expect(alpha).toBe(1);
    expect(canvas.context.globalCompositeOperation).toBe("source-over");
  });

  it("rejects an unsupported blend before requesting any assets", async () => {
    await expect(
      createTiffDownloadJpeg(
        {
          ...request,
          watermark: { ...request.watermark, blend: "multiply" as "screen" },
        },
        new AbortController().signal
      )
    ).rejects.toThrow("Wasserzeichen");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("checks watermark availability before downloading native pixels", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 })
    );
    await expect(
      createTiffDownloadJpeg(request, new AbortController().signal)
    ).rejects.toThrow("404");
    expect(mocks.source).not.toHaveBeenCalled();
    expect(ExportCanvas.instances).toHaveLength(0);
  });

  it("stops strip composition on cancellation and releases canvas and artwork", async () => {
    const controller = new AbortController();
    mocks.read.mockImplementationOnce(async () => {
      controller.abort();
      return new Uint8ClampedArray(8 * 256 * 4);
    });
    await expect(
      createTiffDownloadJpeg(request, controller.signal)
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.read).toHaveBeenCalledOnce();
    expect(
      ExportCanvas.instances[0].context.putImageData
    ).not.toHaveBeenCalled();
    expect(ExportCanvas.instances[0].convertToBlob).not.toHaveBeenCalled();
    expect(artwork.close).toHaveBeenCalledOnce();
    expect([
      ExportCanvas.instances[0].width,
      ExportCanvas.instances[0].height,
    ]).toEqual([1, 1]);
  });

  it("rejects images above the native allocation budget before any network request", async () => {
    await expect(
      createTiffDownloadJpeg(
        { ...request, nativeSize: { width: 30000, height: 30000 } },
        new AbortController().signal
      )
    ).rejects.toThrow("zu groß");
    expect(fetch).not.toHaveBeenCalled();
  });
});
