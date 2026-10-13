import type { DevicePixels } from "@carma-units";
import type {
  ImagePyramidSource,
  ImageViewportSource,
} from "@carma-commons/image-pyramid";
import type { ObliqueDataset, ObliqueImageRecord } from "../../core/types";
import { getCameraCalibration } from "../../core/utils/calibration";

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

/** Preferred public native pyramid; per-record assets also support local imports. */
export const pyramidOptionsOf = (image: ObliqueViewportPhoto) => ({
  avifPyramidUrl:
    image.dataset.preferredAvifPyramidTemplate?.replace(
      /\{imageId\}/g,
      encodeURIComponent(image.record.sourceId)
    ) ??
    image.record.assets?.pyramid?.href ??
    image.dataset.avifPyramidTemplate?.replace(
      /\{imageId\}/g,
      encodeURIComponent(image.record.sourceId)
    ),
});

export const pyramidOf = (image: ObliqueViewportPhoto) =>
  pyramidOptionsOf(image).avifPyramidUrl;

export const viewportSourceOf = (
  image: ObliqueViewportPhoto
): ImageViewportSource => {
  const pyramid = pyramidOf(image);
  if (!pyramid) throw new Error("Native AVIF pyramid URL is missing");
  const calibration = getCameraCalibration(
    image.dataset,
    image.record.cameraId
  );
  const url = new URL(pyramid, globalThis.window.location.href).href;
  return {
    id: image.record.id,
    url,
    kind: "avif",
    nativeSize: {
      width: calibration.widthPx as DevicePixels,
      height: calibration.heightPx as DevicePixels,
    },
    maxSourceDensity: 0.5,
    avifPyramidUrl: url,
  };
};

/** Canonical native identity for object crops, carousel and the scene. */
export const viewportPyramidSourceOf = (
  source: ImageViewportSource
): ImagePyramidSource => ({
  id: source.id,
  kind: "avif",
  url: new URL(
    source.avifPyramidUrl ?? source.url,
    globalThis.window.location.href
  ).href,
  nativeSize: source.nativeSize,
});
