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
