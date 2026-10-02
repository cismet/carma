import { afterEach, describe, expect, it, vi } from "vitest";
import {
  downloadAsBlobAsync,
  getImageUrls,
  loadPreviewImage,
} from "./imageUrls";
import { downloadTiffJpeg } from "./tiff-download";

vi.mock("./tiff-download", () => ({ downloadTiffJpeg: vi.fn() }));

describe("source image URLs", () => {
  it("preserves the served 2024 preview and level-1 download paths", () => {
    expect(
      getImageUrls(
        "050_027_174007398",
        "https://wupp-oblique.cismet.de/2024",
        3,
        1
      )
    ).toEqual({
      previewUrl: "https://wupp-oblique.cismet.de/2024/3/050_027_174007398.jpg",
      downloadUrl:
        "https://wupp-oblique.cismet.de/2024/1/050_027_174007398.jpg",
    });
  });

  it("supports direct original TIFF downloads alongside JPEG previews", () => {
    expect(
      getImageUrls("BW_25_4049", "https://images.example/2026", 3, 1, {
        originalImageUrlTemplate:
          "https://images.example/2026/original/{imageId}.tif",
      })
    ).toEqual({
      previewUrl: "https://images.example/2026/3/BW_25_4049.jpg",
      downloadUrl: "https://images.example/2026/original/BW_25_4049.tif",
    });
  });

  it("encodes source IDs once and treats downloadPath as a complete directory", () => {
    expect(
      getImageUrls("source image", "https://example.com/preview/", 2, 1, {
        downloadPath: "https://example.com/originals/",
      })
    ).toEqual({
      previewUrl: "https://example.com/preview/2/source%20image.jpg",
      downloadUrl: "https://example.com/originals/source%20image.jpg",
    });
  });

  it("uses the delivered asset folder instead of inferring it from the camera prefix", () => {
    const originalImageUrl =
      "https://images.example/2026/tiff/West/FW_11_6458.tif";
    expect(
      getImageUrls("FW_11_6458", "https://images.example/2026", 3, 1, {
        originalImageUrl,
        originalImageUrlTemplate:
          "https://images.example/2026/tiff/{imageId}.tif",
      }).downloadUrl
    ).toBe(originalImageUrl);
  });
});

describe("photo downloads", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.mocked(downloadTiffJpeg).mockReset();
  });

  const watermark = {
    imageUrl: "https://images.example/watermark.png",
    position: "bottom-right" as const,
    opacity: 0.5,
  };
  const mockDownloadLink = () => {
    const link = { href: "", download: "", click: vi.fn() };
    vi.spyOn(document, "createElement").mockReturnValue(
      link as unknown as HTMLAnchorElement
    );
    const createObjectURL = vi.fn(() => "blob:photo");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      "URL",
      class extends URL {
        static createObjectURL = createObjectURL;
        static revokeObjectURL = revokeObjectURL;
      }
    );
    return { link, createObjectURL, revokeObjectURL };
  };

  it("keeps JPEG downloads on the existing fetch path", async () => {
    const blob = new Blob(["photo"], { type: "image/jpeg" });
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, blob: async () => blob });
    vi.stubGlobal("fetch", fetchMock);
    const { link, revokeObjectURL } = mockDownloadLink();
    await downloadAsBlobAsync("https://images.example/1/photo.jpg?version=1");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://images.example/1/photo.jpg?version=1",
      { mode: "cors", signal: undefined }
    );
    expect(downloadTiffJpeg).not.toHaveBeenCalled();
    expect(link.download).toBe("photo.jpg");
    expect(link.click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:photo");
  });

  it("generates a JPG with the explicit native dimensions and exact artwork", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { link, revokeObjectURL } = mockDownloadLink();
    const blob = new Blob(["photo"], { type: "image/jpeg" });
    vi.mocked(downloadTiffJpeg).mockResolvedValue(blob);
    const nativeSize = { width: 1000, height: 800 };
    await downloadAsBlobAsync("https://images.example/photo.TIFF?version=1", {
      tiff: true,
      nativeSize,
      watermark,
    });
    expect(downloadTiffJpeg).toHaveBeenCalledWith(
      {
        url: "https://images.example/photo.TIFF?version=1",
        nativeSize,
        watermark,
      },
      undefined
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(link.download).toBe("photo.jpg");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:photo");
  });

  it("rejects missing watermark configuration before any original-image download", async () => {
    await expect(
      downloadAsBlobAsync("https://images.example/photo.tif", {
        tiff: true,
        nativeSize: { width: 1000, height: 800 },
      })
    ).rejects.toThrow("Wasserzeichen");
    expect(downloadTiffJpeg).not.toHaveBeenCalled();
  });

  it("lets the caller report download failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 })
    );
    await expect(
      downloadAsBlobAsync("https://images.example/missing.jpg")
    ).rejects.toThrow("404");
  });

  it("revokes the generated URL when browser download initiation fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, blob: async () => new Blob(["photo"]) })
    );
    const { link, revokeObjectURL } = mockDownloadLink();
    link.click.mockImplementation(() => {
      throw new Error("blocked");
    });
    await expect(
      downloadAsBlobAsync("https://images.example/photo.jpg")
    ).rejects.toThrow("blocked");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:photo");
  });
});

describe("texture-safe preview loading", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("loads an anonymous-CORS image and retries a stale non-CORS cache entry once", async () => {
    let image: {
      src: string;
      crossOrigin?: string;
      onload: (() => void) | null;
      onerror: (() => void) | null;
    };
    vi.stubGlobal(
      "Image",
      class {
        src = "";
        crossOrigin = "";
        onload = null;
        onerror = null;
        constructor() {
          image = this;
        }
      }
    );
    const loaded = loadPreviewImage("https://images.example/3/photo.jpg");
    expect(image!.crossOrigin).toBe("anonymous");
    image!.onerror?.();
    expect(image!.src).toBe(
      "https://images.example/3/photo.jpg?obliqueTexture=1"
    );
    image!.onload?.();
    await expect(loaded).resolves.toBe(image!);
  });
  it("reports an unavailable source after one retry without a retry loop", async () => {
    let image: { onerror: (() => void) | null };
    vi.stubGlobal(
      "Image",
      class {
        onerror = null;
        constructor() {
          image = this;
        }
      }
    );
    const loaded = loadPreviewImage("https://images.example/missing.jpg");
    image!.onerror?.();
    image!.onerror?.();
    await expect(loaded).rejects.toThrow("nicht verfügbar");
    expect(image!.onerror).toBeNull();
  });
});
