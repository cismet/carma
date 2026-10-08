import type { DevicePixels } from "@carma-units";
import type { ImageViewportSource } from "@carma-commons/image-pyramid";
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

export const pyramidOf = (image: ObliqueViewportPhoto) =>
  image.record.assets?.pyramid?.href ??
  image.dataset.avifPyramidTemplate?.replace(
    /\{imageId\}/g,
    encodeURIComponent(image.record.sourceId)
  );

export const viewportSourceOf = (
  image: ObliqueViewportPhoto
): ImageViewportSource => {
  const original = originalOf(image);
  const pyramid = pyramidOf(image);
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
        : original ??
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
    avifOnly: image.dataset.avifOnly,
  };
};
