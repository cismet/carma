import {
  RING_MATERIAL_PRESETS,
  type RingMaterialPreset,
} from "@carma-mapping/engines/cesium/core";
import {
  REFERENCE_OBJECT_SCALING_MODES,
  type ReferenceObjectScalingMode,
} from "@carma-commons/math";

export type PointPreviewRingVisualDefaults = {
  primitiveId: string;
  scalingMode: ReferenceObjectScalingMode;
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
  scalingMode: REFERENCE_OBJECT_SCALING_MODES.SCREEN,
  targetScreenRadiusCssPx: 32,
  // Visually tuned against PointLabel.tsx HIDDEN_INTERACTION_MARKER_DIAMETER_PX.
  // Keep this as a soft visual match, not a hard shared sizing contract.
  innerHoleRadiusRatio: 0.33,
  alpha: 0.6,
  materialPreset: RING_MATERIAL_PRESETS.COLOR,
  smoothingSampleCount: 90,
  smoothingWindowMs: 300,
  smoothingWeightDecayGamma: 2,
};
