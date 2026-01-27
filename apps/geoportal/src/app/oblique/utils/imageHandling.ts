import {
  OBLIQUE_PREVIEW_IMAGE_EXTENSION,
  OBLIQUE_PREVIEW_QUALITY,
} from "../constants";

export function getPreviewImageUrl(
  previewPath: string,
  level: OBLIQUE_PREVIEW_QUALITY,
  imageId: string
): string {
  return `${previewPath}/${level}/${imageId}.${OBLIQUE_PREVIEW_IMAGE_EXTENSION}`;
}

export const getImageUrls = (
  id: string | undefined,
  path: string | undefined,
  level: OBLIQUE_PREVIEW_QUALITY,
  downloadLevel?: OBLIQUE_PREVIEW_QUALITY
) => {
  if (!id || !path || id.length === 0 || path.length === 0) {
    return {
      previewUrl: null,
      downloadUrl: null,
    };
  }

  const previewUrl = getPreviewImageUrl(path, level, id);

  const downloadUrl = getPreviewImageUrl(path, downloadLevel ?? level, id);

  return { previewUrl, downloadUrl };
};
