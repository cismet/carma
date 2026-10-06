/**
 * The preview levels the oblique image server offers: 0 is the full image,
 * every step up halves the edge length. Level 6 is the thumbnail the preview
 * starts with while the real level loads.
 */
export const PREVIEW_QUALITY = {
  LEVEL_0: "0",
  LEVEL_1: "1",
  LEVEL_2: "2",
  LEVEL_3: "3",
  LEVEL_4: "4",
  LEVEL_5: "5",
  LEVEL_6: "6",
} as const;

export type PreviewQualityLevel =
  (typeof PREVIEW_QUALITY)[keyof typeof PREVIEW_QUALITY];

export const PREVIEW_IMAGE_EXTENSION = "jpg";

/** Match the legacy Cesium footprint and preview outline. */
export const FOOTPRINT_SELECTION_COLOR = "#ffffff";
