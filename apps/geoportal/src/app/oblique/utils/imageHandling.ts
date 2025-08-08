import { AVIF_LEVELS, OBLIQUE_PREVIEW_QUALITY } from "../constants";

const isAvifLevel = (level: string): level is OBLIQUE_PREVIEW_QUALITY => {
  return AVIF_LEVELS.includes(level as OBLIQUE_PREVIEW_QUALITY);
};

export function getPreviewImageUrl(
  previewPath: string,
  level: OBLIQUE_PREVIEW_QUALITY,
  imageId: string
): string {
  return `${previewPath}/${level}/${imageId}.${
    isAvifLevel(level) ? "avif" : "jpg"
  }`;
}

export const getImageUrls = (
  id: string | undefined,
  path: string | undefined,
  level: OBLIQUE_PREVIEW_QUALITY
) => {
  if (!id || !path || id.length === 0 || path.length === 0) {
    return {
      previewUrl: null,
      previewUrlHq: null,
      previewUrlOriginal: null,
      downloadUrl: null,
    };
  }

  const previewUrl = getPreviewImageUrl(path, level, id);

  const previewUrlHq = getPreviewImageUrl(
    path,
    OBLIQUE_PREVIEW_QUALITY.LEVEL_2,
    id
  );

  const previewUrlOriginal = getPreviewImageUrl(
    path,
    OBLIQUE_PREVIEW_QUALITY.LEVEL_1,
    id
  );

  const downloadUrl = getPreviewImageUrl(
    path,
    OBLIQUE_PREVIEW_QUALITY.LEVEL_2,
    id
  );

  return { previewUrl, previewUrlHq, previewUrlOriginal, downloadUrl };
};
