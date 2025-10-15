export const OBLIQUE_PREVIEW_QUALITIES = {
  LEVEL_0: "0",
  LEVEL_1: "1",
  LEVEL_2: "2",
  LEVEL_3: "3",
  LEVEL_4: "4",
  LEVEL_5: "5",
  LEVEL_6: "6",
  LEVEL_1_HQ: "1-hq", // TODO check levels currently on server
  LEVEL_2_HQ: "2-hq",
  LEVEL_3_HQ: "3-hq",
  LEVEL_1_HQ_AVIF: "1-hq-avif-10bit", // experimental
  LEVEL_2_HQ_AVIF: "2-hq-avif-10bit", // experimental
  LEVEL_3_HQ_AVIF: "3-hq-avif-10bit", // experimental
} as const;

export type ObliquePreviewQualityMap = typeof OBLIQUE_PREVIEW_QUALITIES;
export type ObliquePreviewQualityKey = keyof ObliquePreviewQualityMap;
export type ObliquePreviewQuality =
  ObliquePreviewQualityMap[ObliquePreviewQualityKey];

export const AVIF_QUALITIES: ObliquePreviewQuality[] = [
  OBLIQUE_PREVIEW_QUALITIES.LEVEL_1_HQ_AVIF,
  OBLIQUE_PREVIEW_QUALITIES.LEVEL_2_HQ_AVIF,
  OBLIQUE_PREVIEW_QUALITIES.LEVEL_3_HQ_AVIF,
];
