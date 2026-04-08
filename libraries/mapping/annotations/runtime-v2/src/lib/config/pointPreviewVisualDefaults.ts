import {
  RING_MATERIAL_PRESETS,
  type RingMaterialPreset,
} from "@carma-mapping/engines/cesium/core";

export type PointPreviewRingVisualDefaults = {
  primitiveId: string;
  scalingMode: "screen" | "world";
  innerHoleRadiusRatio: number;
  alpha: number;
  materialPreset: RingMaterialPreset;
  targetScreenRadiusCssPx: number;
  smoothingSampleCount: number;
  smoothingWindowMs: number;
  smoothingWeightDecayGamma: number;
};

export const pointPreviewRingVisualDefaults: PointPreviewRingVisualDefaults = {
  primitiveId: "measurement-preview-point-ring",
  scalingMode: "screen",
  innerHoleRadiusRatio: 0.5,
  alpha: 0.66,
  materialPreset: RING_MATERIAL_PRESETS.COLOR,
  targetScreenRadiusCssPx: 48,
  smoothingSampleCount: 90,
  smoothingWindowMs: 300,
  smoothingWeightDecayGamma: 2,
};
