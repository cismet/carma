export const ANNOTATIONS_HOST_DEFAULTS = {
  pointQuery: {
    discSmoothingSampleCount: 120,
    discSmoothingWindowMs: 500,
    discSmoothingWeightDecayGamma: 3,
  },
  hoverClearDelayMs: 34,
  infoBoxFlyTo: {
    minRadiusMeters: 80,
    paddingFactor: 1.15,
  },
  additiveSelectionModifierKey: "Shift",
} as const;
