export type PointPreviewRingVisualDefaults = {
  primitiveId: string;
  radiusScale: number;
  alpha: number;
  screenRadiusPx: number;
  smoothingSampleCount: number;
  smoothingWindowMs: number;
};

export const pointPreviewRingVisualDefaults: PointPreviewRingVisualDefaults = {
  primitiveId: "measurement-preview-point-ring",
  radiusScale: 1.4,
  alpha: 0.66,
  screenRadiusPx: 48,
  smoothingSampleCount: 10,
  smoothingWindowMs: 300,
};
