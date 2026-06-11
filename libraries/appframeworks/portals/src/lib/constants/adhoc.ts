export const DEFAULT_ADHOC_FEATURE_COLLECTION_ID = "default";
export const DEFAULT_ADHOC_FEATURE_LAYER_ID = "adhoc";

export const ADHOC_LAYER_SOURCES = {
  ANNOTATIONS: "annotations",
  TWO_D_MEASUREMENTS: "2dMeasurements",
} as const;

export type AdhocLayerSource =
  (typeof ADHOC_LAYER_SOURCES)[keyof typeof ADHOC_LAYER_SOURCES];

export const ADHOC_LAYER_VISIBILITIES = {
  TWO_D: "2d",
  THREE_D: "3d",
} as const;

export type AdhocLayerVisibility =
  (typeof ADHOC_LAYER_VISIBILITIES)[keyof typeof ADHOC_LAYER_VISIBILITIES];
