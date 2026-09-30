import { describe, expect, it } from "vitest";
import { getImageUrls } from "./imageUrls";

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
