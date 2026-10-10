import { describe, expect, it, vi } from "vitest";
import type { ObliqueDataset, ObliqueImageRecord } from "../../core/types";
import {
  originalOf,
  viewportSourceOf,
  viewportPyramidSourceOf,
} from "./oblique-viewport-source";
import { imagePyramidSourceKey } from "../../../../../../commons/image-pyramid/src/lib/runtime/image-level-stack-pool";
import { nativePreviewSource } from "./native-preview-pool";

vi.mock("@carma-commons/image-pyramid", () => ({
  ImageLevelStackPool: class {},
}));
vi.mock("./tiff-download", () => ({ downloadTiffJpeg: vi.fn() }));
vi.mock("../../core/utils/calibration", () => ({
  getCameraCalibration: () => ({ widthPx: 12000, heightPx: 18000 }),
}));

const photo = (overrides: Partial<ObliqueDataset> = {}) => ({
  record: {
    id: "series::photo",
    sourceId: "photo",
    seriesId: "series",
    cameraId: "camera",
  } as ObliqueImageRecord,
  dataset: {
    id: "series",
    previewPath: "https://imagery.test/2024/oblique/preview",
    originalImageUrlTemplate:
      "https://imagery.test/2024/oblique/tiff/{imageId}.tif",
    preferredAvifPyramidTemplate:
      "https://imagery.test/2024/image/{imageId}.avif",
    minimumPreviewQualityLevel: "1",
    ...overrides,
  } as ObliqueDataset,
});
const nativeSource = (image: ReturnType<typeof photo>) => {
  const viewport = viewportSourceOf(image);
  return nativePreviewSource({
    imageId: image.record.sourceId,
    path: image.dataset.previewPath,
    sourceUrl: viewport.url,
    avifPyramidUrl: viewport.avifPyramidUrl,
    nativeSize: viewport.nativeSize,
    minimumQualityLevel: image.dataset.minimumPreviewQualityLevel,
  });
};

describe("preferred native preview source policy", () => {
  it("uses native 2024 while preserving the separate original download URL", () => {
    const image = photo(),
      viewport = viewportSourceOf(image);
    expect(viewport).toMatchObject({
      kind: "avif",
      avifPyramidUrl: "https://imagery.test/2024/image/photo.avif",
      url: "https://imagery.test/2024/image/photo.avif",
    });
    expect(nativeSource(image)).not.toHaveProperty("fallbacks");
    expect(originalOf(image)).toBe(
      "https://imagery.test/2024/oblique/tiff/photo.tif"
    );
  });
  it("keeps 2026 native without retrying the legacy pyramid", () => {
    const image = photo({
      id: "wuppertal-2026",
      avifOnly: true,
      preferredAvifPyramidTemplate:
        "https://imagery.test/2026/image/{imageId}.avif",
      avifPyramidTemplate: "https://imagery.test/2026/avif/{imageId}.avif",
    });
    const viewport = viewportSourceOf(image);
    expect(viewport).toMatchObject({
      url: "https://imagery.test/2026/image/photo.avif",
      avifPyramidUrl: "https://imagery.test/2026/image/photo.avif",
    });
    expect(nativeSource(image)).not.toHaveProperty("fallbacks");
    expect(originalOf(image)).toBeUndefined();
  });
  it("honors a per-record legacy pyramid without replacing the preferred native URL", () => {
    const image = photo({ avifOnly: true });
    image.record.assets = {
      pyramid: {
        href: "https://imagery.test/published/photo.avif",
        type: "image/avif",
      },
    };
    expect(viewportSourceOf(image)).toMatchObject({
      avifPyramidUrl: "https://imagery.test/2024/image/photo.avif",
    });
  });
  it("fails a missing native descriptor rather than selecting the original TIFF", () => {
    const image = photo({ preferredAvifPyramidTemplate: undefined });
    expect(() => viewportSourceOf(image)).toThrow(
      "Native AVIF pyramid URL is missing"
    );
    expect(originalOf(image)).toBe(
      "https://imagery.test/2024/oblique/tiff/photo.tif"
    );
  });
});

describe("shared preview, object crop and thumbnail source identity", () => {
  it.each([
    ["2024", {}],
    [
      "2026",
      {
        avifOnly: true,
        avifPyramidTemplate: "https://imagery.test/2026/avif/{imageId}.avif",
        preferredAvifPyramidTemplate:
          "https://imagery.test/2026/image/{imageId}.avif",
      },
    ],
  ] as const)(
    "uses one representation contract for %s consumers",
    (_year, options) => {
      const image = photo(options);
      const viewport = viewportSourceOf(image);
      const main = nativeSource(image);
      const object = viewportPyramidSourceOf(viewport)!;
      const thumbnail = nativePreviewSource({
        imageId: image.record.sourceId,
        path: image.dataset.previewPath,
        sourceUrl: originalOf(image) ?? viewport.url,
        avifPyramidUrl: viewport.avifPyramidUrl,
        nativeSize: viewport.nativeSize,
        minimumQualityLevel: image.dataset.minimumPreviewQualityLevel,
      });
      expect(imagePyramidSourceKey(object)).toBe(imagePyramidSourceKey(main));
      expect(imagePyramidSourceKey(thumbnail)).toBe(
        imagePyramidSourceKey(main)
      );
      expect(viewport).not.toHaveProperty("minimumQualityLevel");
    }
  );

  it("does not change the native identity when obsolete JPEG settings change", () => {
    const image = photo();
    const main = nativeSource(image);
    const viewport = viewportPyramidSourceOf(viewportSourceOf(image))!;
    expect(viewport).not.toHaveProperty("fallbacks");
    const changed = nativeSource(photo({ minimumPreviewQualityLevel: "0" }));
    expect(imagePyramidSourceKey(changed)).toBe(imagePyramidSourceKey(main));
  });
});
