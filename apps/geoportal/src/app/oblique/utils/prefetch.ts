import type { OBLIQUE_PREVIEW_QUALITY } from "../constants";
import type { ObliqueImageRecordMap } from "../types";
import type { CardinalDirectionEnum } from "./orientationUtils";

import { computeSiblingsByCardinal } from "./siblings";
import { getImageUrls } from "./imageHandling";

/**
 * Lightweight browser cache warmer for a single image URL.
 */
export const prefetchImage = (url: string | null | undefined) => {
  if (!url) return;
  const img = new Image();
  // Hint the browser this is not render-blocking
  img.decoding = "async";
  img.src = url;
};

/**
 * Prefetch the preview URL for the sibling of a given image in a specific direction.
 * Only prefetches the standard preview
 */
export const prefetchSiblingPreviewFor = (
  imageId: string,
  dir: CardinalDirectionEnum,
  imageRecords: ObliqueImageRecordMap | null,
  previewPath: string,
  previewQualityLevel: OBLIQUE_PREVIEW_QUALITY
) => {
  if (!imageRecords) return;
  const rec = imageRecords.get(imageId);
  if (!rec) return;

  const siblings = computeSiblingsByCardinal(rec, imageRecords);
  const sib = siblings[dir];
  if (!sib) return;

  const { previewUrl } = getImageUrls(sib.id, previewPath, previewQualityLevel);
  prefetchImage(previewUrl);
};
