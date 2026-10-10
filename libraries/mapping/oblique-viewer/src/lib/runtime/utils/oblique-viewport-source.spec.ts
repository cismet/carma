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
    avifFormat: viewport.avifFormat,
    avifPyramidFallbackUrl: viewport.avifPyramidFallbackUrl,
    avifOnly: viewport.avifOnly,
    nativeSize: viewport.nativeSize,
    minimumQualityLevel: image.dataset.minimumPreviewQualityLevel,
  });
};

describe("preferred native preview source policy", () => {
  it("allows 2024 JPEG fallback explicitly when the dataset omits avifOnly", () => {
    const image = photo(),
      viewport = viewportSourceOf(image);
    expect(viewport).toMatchObject({
      kind: "avif",
      avifOnly: false,
      avifFormat: "native",
      avifPyramidUrl: "https://imagery.test/2024/image/photo.avif",
      url: "https://imagery.test/2024/oblique/preview/1/photo.jpg",
    });
    // The viewport pool's kind-based default must not turn 2024 into AVIF-only.
    expect(viewport.avifOnly ?? viewport.kind === "avif").toBe(false);
    expect(nativeSource(image).fallbacks).toEqual([
      {
        url: viewport.url,
        kind: "jpeg",
        nativeSize: viewport.nativeSize,
        jpegLevels: [1, 2, 3, 4, 5, 6],
      },
    ]);
    expect(originalOf(image)).toBe(
      "https://imagery.test/2024/oblique/tiff/photo.tif"
    );
  });
  it("keeps 2026 strictly AVIF with the published legacy pyramid as its only fallback", () => {
    const image = photo({
      id: "wuppertal-2026",
      avifOnly: true,
      preferredAvifPyramidTemplate:
        "https://imagery.test/2026/image/{imageId}.avif",
      avifPyramidTemplate: "https://imagery.test/2026/avif/{imageId}.avif",
    });
    const viewport = viewportSourceOf(image);
    expect(viewport).toMatchObject({
      avifOnly: true,
      avifFormat: "native",
      url: "https://imagery.test/2026/image/photo.avif",
      avifPyramidUrl: "https://imagery.test/2026/image/photo.avif",
      avifPyramidFallbackUrl: "https://imagery.test/2026/avif/photo.avif",
    });
    expect(nativeSource(image).fallbacks).toEqual([
      {
        kind: "avif",
        url: viewport.avifPyramidFallbackUrl,
        nativeSize: viewport.nativeSize,
      },
    ]);
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
      avifPyramidFallbackUrl: "https://imagery.test/published/photo.avif",
    });
  });
  it("retains the existing original-backed descriptor when native preference is absent", () => {
    const image = photo({ preferredAvifPyramidTemplate: undefined });
    expect(viewportSourceOf(image)).toMatchObject({
      kind: "tiff",
      url: "https://imagery.test/2024/oblique/tiff/photo.tif",
      avifOnly: false,
      avifFormat: undefined,
      avifPyramidUrl: undefined,
    });
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
        avifFormat: viewport.avifFormat,
        avifPyramidFallbackUrl: viewport.avifPyramidFallbackUrl,
        avifOnly: viewport.avifOnly,
        nativeSize: viewport.nativeSize,
        minimumQualityLevel: image.dataset.minimumPreviewQualityLevel,
      });
      expect(imagePyramidSourceKey(object)).toBe(imagePyramidSourceKey(main));
      expect(imagePyramidSourceKey(thumbnail)).toBe(
        imagePyramidSourceKey(main)
      );
      expect(viewport.minimumQualityLevel).toBe("1");
    }
  );

  it("keeps the 2024 minimum JPEG level in the shared contract instead of adding level zero", () => {
    const image = photo();
    const main = nativeSource(image);
    const viewport = viewportPyramidSourceOf(viewportSourceOf(image))!;
    expect(viewport.fallbacks?.[0]).toMatchObject({
      jpegLevels: [1, 2, 3, 4, 5, 6],
    });
    const incorrectlyUnbounded = {
      ...main,
      fallbacks: main.fallbacks!.map((fallback) => ({
        ...fallback,
        jpegLevels: [0, 1, 2, 3, 4, 5, 6],
      })),
    };
    expect(imagePyramidSourceKey(incorrectlyUnbounded)).not.toBe(
      imagePyramidSourceKey(main)
    );
  });
});
