import { afterEach, describe, expect, it, vi } from "vitest";
import { getImageUrls, loadPreviewImage } from "./imageUrls";

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

  it("previews temporary JPEGs and downloads the actual development TIFF", () => {
    expect(
      getImageUrls("BW_25_4049", "http://localhost:8926", 3, 1, {
        originalImageUrlTemplate:
          "http://localhost:8926/original/{imageId}.tif",
      })
    ).toEqual({
      previewUrl: "http://localhost:8926/3/BW_25_4049.jpg",
      downloadUrl: "http://localhost:8926/original/BW_25_4049.tif",
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
