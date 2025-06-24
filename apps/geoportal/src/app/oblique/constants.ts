export enum OBLIQUE_PREVIEW_QUALITY {
  LEVEL_0 = "0",
  LEVEL_1 = "1",
  LEVEL_2 = "2",
  LEVEL_3 = "3",
  LEVEL_4 = "4",
  LEVEL_5 = "5",
  LEVEL_6 = "6",
  LEVEL_1_HQ = "1-hq",
  LEVEL_2_HQ = "2-hq",
  LEVEL_3_HQ = "3-hq",
  LEVEL_1_HQ_AVIF = "1-hq-avif-10bit",
  LEVEL_2_HQ_AVIF = "2-hq-avif-10bit",
  LEVEL_3_HQ_AVIF = "3-hq-avif-10bit",
}

export const AVIF_LEVELS = [
  OBLIQUE_PREVIEW_QUALITY.LEVEL_1_HQ_AVIF,
  OBLIQUE_PREVIEW_QUALITY.LEVEL_2_HQ_AVIF,
  OBLIQUE_PREVIEW_QUALITY.LEVEL_3_HQ_AVIF,
];
