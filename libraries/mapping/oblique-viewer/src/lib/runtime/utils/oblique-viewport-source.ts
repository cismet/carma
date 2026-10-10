import type { DevicePixels } from "@carma-units";
import type {
  ImagePyramidSource,
  ImageViewportSource,
} from "@carma-commons/image-pyramid";
import type { ObliqueDataset, ObliqueImageRecord } from "../../core/types";
import { getCameraCalibration } from "../../core/utils/calibration";
import { getPreviewImageUrl } from "./imageUrls";

/** Source metadata shared by object views and projected photo transitions. */
export type ObliqueViewportPhoto = Readonly<{
  record: ObliqueImageRecord;
  dataset: ObliqueDataset;
}>;

export const originalOf = (image: ObliqueViewportPhoto) =>
  image.dataset.avifOnly
    ? undefined
    : image.record.assets?.original?.href ??
      image.dataset.originalImageUrlTemplate?.replace(
        /\{imageId\}/g,
        encodeURIComponent(image.record.sourceId)
      );

export const legacyPyramidOf = (image: ObliqueViewportPhoto) =>
  image.record.assets?.pyramid?.href ??
  image.dataset.avifPyramidTemplate?.replace(
    /\{imageId\}/g,
    encodeURIComponent(image.record.sourceId)
  );

export const pyramidOptionsOf = (image: ObliqueViewportPhoto) => {
  const preferred = image.dataset.preferredAvifPyramidTemplate?.replace(
    /\{imageId\}/g,
    encodeURIComponent(image.record.sourceId)
  );
  const legacy = legacyPyramidOf(image);
  return {
    avifPyramidUrl: preferred ?? legacy,
    avifFormat: preferred ? ("native" as const) : undefined,
    avifPyramidFallbackUrl:
      preferred && legacy !== preferred ? legacy : undefined,
  };
};

export const pyramidOf = (image: ObliqueViewportPhoto) =>
  pyramidOptionsOf(image).avifPyramidUrl;

export const viewportSourceOf = (
  image: ObliqueViewportPhoto
): ImageViewportSource => {
  const original = originalOf(image);
  const pyramid = pyramidOf(image);
  const pyramidOptions = pyramidOptionsOf(image);
  const calibration = getCameraCalibration(
    image.dataset,
    image.record.cameraId
  );
  const absolute = (url: string) =>
    new URL(url, globalThis.window.location.href).href;
  return {
    id: image.record.id,
    url: absolute(
      image.dataset.avifOnly && pyramid
        ? pyramid
        : (pyramidOptions.avifFormat ? undefined : original) ??
            getPreviewImageUrl(
              image.dataset.previewPath,
              image.dataset.minimumPreviewQualityLevel ?? "0",
              image.record.sourceId
            )
    ),
    kind: pyramid ? "avif" : original ? "tiff" : "jpeg",
    nativeSize: {
      width: calibration.widthPx as DevicePixels,
      height: calibration.heightPx as DevicePixels,
    },
    minimumQualityLevel: image.dataset.minimumPreviewQualityLevel,
    maxSourceDensity: pyramid ? 0.5 : undefined,
    avifPyramidUrl: pyramid ? absolute(pyramid) : undefined,
    avifFormat: pyramidOptions.avifFormat,
    avifPyramidFallbackUrl: pyramidOptions.avifPyramidFallbackUrl
      ? absolute(pyramidOptions.avifPyramidFallbackUrl)
      : undefined,
    avifOnly: image.dataset.avifOnly === true,
  };
};

/** Canonical AVIF identity for object crops and carousel output buffers. */
export const viewportPyramidSourceOf = (
  source: ImageViewportSource
): ImagePyramidSource | undefined => {
  if (!source.avifPyramidUrl && source.kind !== "avif") return undefined;
  const absolute = (url: string) =>
    new URL(url, globalThis.window.location.href).href;
  const primary = absolute(source.avifPyramidUrl ?? source.url);
  const fallbacks: NonNullable<ImagePyramidSource["fallbacks"]>[number][] = [];
  if (source.avifFormat === "native") {
    if (
      source.avifPyramidFallbackUrl &&
      absolute(source.avifPyramidFallbackUrl) !== primary
    )
      fallbacks.push({
        kind: "avif",
        url: absolute(source.avifPyramidFallbackUrl),
        nativeSize: source.nativeSize,
      });
    if (
      !source.avifOnly &&
      /\.jpe?g$/i.test(
        new URL(source.url, globalThis.window.location.href).pathname
      )
    )
      fallbacks.push({
        kind: "jpeg",
        url: absolute(source.url),
        nativeSize: source.nativeSize,
        jpegLevels: [0, 1, 2, 3, 4, 5, 6].filter(
          (level) => level >= Number(source.minimumQualityLevel ?? 0)
        ),
      });
  }
  return {
    id: source.id,
    kind: "avif",
    url: primary,
    nativeSize: source.nativeSize,
    ...(source.avifFormat ? { format: source.avifFormat, fallbacks } : {}),
  };
};
