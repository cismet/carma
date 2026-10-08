import { afterEach, expect, it, vi } from "vitest";
import { createAvifDownloadJpeg } from "./avif-download-jpeg";
const mock = vi.hoisted(() => ({
  select: vi.fn(),
  read: vi.fn(),
  close: vi.fn(),
}));
vi.mock("@carma-commons/image-pyramid", () => ({
  AvifPyramidPreviewSource: class {
    select = mock.select;
    read = mock.read;
    close = mock.close;
  },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("exports the exact published L1 extent without fetching or drawing watermark artwork", async () => {
  const putImageData = vi.fn(),
    drawImage = vi.fn(),
    convertToBlob = vi.fn(
      async () => new Blob(["jpeg"], { type: "image/jpeg" })
    );
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      width = 4;
      height = 3;
      getContext() {
        return { putImageData, drawImage };
      }
      convertToBlob = convertToBlob;
    }
  );
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
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  mock.select.mockResolvedValue({
    image: { level: 1, getWidth: () => 4, getHeight: () => 3 },
  });
  mock.read.mockResolvedValue(new Uint8ClampedArray(48));
  const blob = await createAvifDownloadJpeg(
    { format: "avif", url: "/photo.avif", nativeSize: { width: 8, height: 6 } },
    new AbortController().signal
  );
  expect(blob.type).toBe("image/jpeg");
  expect(mock.read.mock.calls[0][1]).toEqual([0, 0, 4, 3]);
  expect(putImageData).toHaveBeenCalledOnce();
  expect(drawImage).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(mock.close).toHaveBeenCalledOnce();
});
it("fails closed when the primary public L1 is absent and closes its source", async () => {
  mock.select.mockResolvedValue({ image: { level: 2 } });
  await expect(
    createAvifDownloadJpeg(
      {
        format: "avif",
        url: "/photo.avif",
        nativeSize: { width: 8, height: 6 },
      },
      new AbortController().signal
    )
  ).rejects.toThrow(/L1/);
  expect(mock.read).not.toHaveBeenCalled();
  expect(mock.close).toHaveBeenCalledOnce();
});
