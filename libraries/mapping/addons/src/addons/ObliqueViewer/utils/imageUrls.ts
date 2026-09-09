import { PREVIEW_IMAGE_EXTENSION, type PreviewQualityLevel } from "../constants";
import type { CardinalDirection, ObliqueImageRecordMap } from "../types";
import { computeSiblingsByCardinal } from "./siblings";

export const getPreviewImageUrl = (
  previewPath: string,
  level: PreviewQualityLevel,
  imageId: string
): string => `${previewPath}/${level}/${imageId}.${PREVIEW_IMAGE_EXTENSION}`;

export const getImageUrls = (
  id: string | undefined,
  path: string | undefined,
  level: PreviewQualityLevel,
  downloadLevel?: PreviewQualityLevel
): { previewUrl: string | null; downloadUrl: string | null } => {
  if (!id || !path) {
    return { previewUrl: null, downloadUrl: null };
  }
  return {
    previewUrl: getPreviewImageUrl(path, level, id),
    downloadUrl: getPreviewImageUrl(path, downloadLevel ?? level, id),
  };
};

/** warms the browser cache for one url */
export const prefetchImage = (url: string | null | undefined): void => {
  if (!url) return;
  const img = new Image();
  img.decoding = "async";
  img.src = url;
};

/** warms the cache for the sibling one step further in the same direction */
export const prefetchSiblingPreviewFor = (
  imageId: string,
  dir: CardinalDirection,
  imageRecords: ObliqueImageRecordMap | null,
  previewPath: string,
  previewQualityLevel: PreviewQualityLevel
): void => {
  const rec = imageRecords?.get(imageId);
  if (!rec || !imageRecords) return;
  const sibling = computeSiblingsByCardinal(rec, imageRecords)[dir];
  if (!sibling) return;
  prefetchImage(getImageUrls(sibling.id, previewPath, previewQualityLevel).previewUrl);
};

export const downloadAsBlobAsync = async (downloadUrl: string): Promise<void> => {
  try {
    const response = await fetch(downloadUrl, { mode: "cors" });
    if (!response.ok) throw new Error("Network response was not ok");
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const filename =
      downloadUrl.split("/").pop() || `oblique-image-${Date.now()}.jpg`;
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.debug("[OBLIQUE] download failed", error);
  }
};
