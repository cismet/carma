// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DevicePixels } from "@carma-units";
const source = vi.hoisted(() => ({
  select: vi.fn(),
  read: vi.fn(),
  close: vi.fn(),
  tiff: vi.fn(),
  create: vi.fn(),
  registerNative: vi.fn(),
  releaseNative: vi.fn(),
}));
vi.mock("@carma-commons/image-pyramid", () => ({
  registerNativeAvifBlob: (...args: unknown[]) => {
    source.registerNative(...args);
    return source.releaseNative;
  },
  createFallbackAvifPreviewSource: (...args: unknown[]) => {
    source.create(...args);
    return {
      select: source.select,
      read: source.read,
      close: source.close,
      representationSelected: false,
    };
  },
  isAvifSourceMissing: (error: unknown) =>
    error instanceof Error &&
    error.name === "AvifHttpError" &&
    "status" in error &&
    (error.status === 404 || error.status === 410),
  createTiffPreviewSource: async () => {
    source.tiff();
    return {};
  },
}));
let worker: {
  onmessage: ((event: MessageEvent<unknown>) => Promise<void>) | null;
  postMessage: ReturnType<typeof vi.fn>;
};
let network: ReturnType<typeof vi.fn>;
const input = {
  url: "https://imagery.test/photo.avif",
  avifPyramidUrl: "https://imagery.test/photo.avif",
  avifOnly: true,
  tiff: true,
  nativeSize: { width: 512 as DevicePixels, height: 384 as DevicePixels },
};
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  worker = { onmessage: null, postMessage: vi.fn() };
  network = vi.fn();
  vi.stubGlobal("self", worker);
  vi.stubGlobal("fetch", network);
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      constructor(readonly width: number, readonly height: number) {}
      getContext() {
        return { putImageData: vi.fn() };
      }
      async convertToBlob() {
        return new Blob(["png"], { type: "image/png" });
      }
    }
  );
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
    "createImageBitmap",
    vi.fn(async () => ({ width: 512, height: 384, close: vi.fn() }))
  );
  source.select.mockReset();
  source.read.mockResolvedValue(new Uint8ClampedArray(512 * 384 * 4));
  await import("./preview-thumbnail.worker");
});
afterEach(() => vi.unstubAllGlobals());
describe("AVIF-only thumbnail worker", () => {
  it("fails unpublished metadata without TIFF construction or full-image fetch", async () => {
    source.select.mockRejectedValue(Error("not published"));
    await worker.onmessage!({ data: input } as MessageEvent<unknown>);
    expect(worker.postMessage.mock.lastCall?.[0].error).toMatch(
      /not published/
    );
    expect(network).not.toHaveBeenCalled();
    expect(source.tiff).not.toHaveBeenCalled();
    expect(source.close).toHaveBeenCalledOnce();
  });
  it("fails a missing pyramid descriptor before any transport", async () => {
    await worker.onmessage!({
      data: { ...input, avifPyramidUrl: undefined },
    } as MessageEvent<unknown>);
    expect(worker.postMessage.mock.lastCall?.[0].error).toMatch(/AVIF-only/);
    expect(network).not.toHaveBeenCalled();
    expect(source.select).not.toHaveBeenCalled();
    expect(source.tiff).not.toHaveBeenCalled();
  });
  it("decodes only the bounded AVIF coarse page when available", async () => {
    source.select.mockResolvedValue({
      image: { getWidth: () => 512, getHeight: () => 384 },
      refinements: [],
    });
    await worker.onmessage!({ data: input } as MessageEvent<unknown>);
    expect(worker.postMessage.mock.lastCall?.[0].bitmap).toBeDefined();
    expect(source.read).toHaveBeenCalledOnce();
    expect(network).not.toHaveBeenCalled();
    expect(source.tiff).not.toHaveBeenCalled();
  });
  it("requests exact L5 density from calibration rather than a512-long-edge estimate", async () => {
    source.select.mockRejectedValue(Error("stop after selection"));
    await worker.onmessage!({
      data: { ...input, nativeSize: { width: 12736, height: 19136 } },
    } as MessageEvent<unknown>);
    expect(source.select.mock.calls[0][0].target).toEqual({
      width: 398,
      height: 598,
    });
  });
  it("reports missing publication separately for the short asset cooldown", async () => {
    source.select.mockRejectedValue(
      Object.assign(Error("AVIF HTTP 404"), {
        name: "AvifHttpError",
        status: 404,
      })
    );
    await worker.onmessage!({ data: input } as MessageEvent<unknown>);
    expect(worker.postMessage.mock.lastCall?.[0].missing).toBe(true);
    expect(network).not.toHaveBeenCalled();
  });
});

it.each([
  "Failed to fetch",
  "Load failed",
  "NetworkError when attempting to fetch resource.",
])("does not mark a native fetch/CORS failure missing: %s", async (message) => {
  source.select.mockRejectedValue(new TypeError(message));
  await worker.onmessage!({ data: input } as MessageEvent<unknown>);
  expect(worker.postMessage.mock.lastCall?.[0].missing).toBe(false);
});
it.each([
  new Error("Decode failed"),
  new TypeError("Cannot read properties of undefined"),
  new DOMException("Aborted", "AbortError"),
])("does not turn non-fetch failures into missing", async (error) => {
  source.select.mockRejectedValue(error);
  await worker.onmessage!({ data: input } as MessageEvent<unknown>);
  expect(worker.postMessage.mock.lastCall?.[0].missing).toBe(false);
});

it("forwards the native hint and explicit legacy AVIF alternative", async () => {
  const request = {
    ...input,
    avifFormat: "native",
    avifPyramidFallbackUrl: "https://imagery.test/old.avif",
  };
  source.select.mockRejectedValue(Error("stop after creation"));
  await worker.onmessage!({ data: request } as MessageEvent<unknown>);
  expect(source.create).toHaveBeenCalledWith(
    input.avifPyramidUrl,
    16 * 1024 * 1024,
    "low",
    { format: "native", fallbackUrl: request.avifPyramidFallbackUrl }
  );
});

it("releases a registered native thumbnail blob even when source selection fails", async () => {
  const nativeAvifFile = new Blob(["native fixture"]);
  source.select.mockRejectedValue(Error("selection failed"));
  await worker.onmessage!({
    data: { ...input, nativeAvifFile },
  } as MessageEvent<unknown>);
  expect(source.registerNative).toHaveBeenCalledWith(
    input.avifPyramidUrl,
    nativeAvifFile,
    { previewOnly: true }
  );
  expect(source.close).toHaveBeenCalledOnce();
  expect(source.releaseNative).toHaveBeenCalledOnce();
  expect(network).not.toHaveBeenCalled();
});
