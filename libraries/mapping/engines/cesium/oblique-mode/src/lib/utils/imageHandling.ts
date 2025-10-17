import {
  OBLIQUE_PREVIEW_QUALITIES,
  AVIF_QUALITIES,
  type ObliquePreviewQuality,
} from "../constants";

const isAvifLevel = (level: ObliquePreviewQuality): boolean => {
  return AVIF_QUALITIES.includes(level);
};

export function getPreviewImageUrl(
  previewPath: string,
  level: ObliquePreviewQuality,
  imageId: string
): string {
  return `${previewPath}/${level}/${imageId}.${
    isAvifLevel(level) ? "avif" : "jpg"
  }`;
}

export const getImageUrls = (
  id: string | undefined,
  path: string | undefined,
  level: ObliquePreviewQuality
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
    OBLIQUE_PREVIEW_QUALITIES.LEVEL_2,
    id
  );

  const previewUrlOriginal = getPreviewImageUrl(
    path,
    OBLIQUE_PREVIEW_QUALITIES.LEVEL_1,
    id
  );

  const downloadUrl = getPreviewImageUrl(
    path,
    OBLIQUE_PREVIEW_QUALITIES.LEVEL_2,
    id
  );

  return { previewUrl, previewUrlHq, previewUrlOriginal, downloadUrl };
};
