export const pointQueryControllerDefaults = Object.freeze({
  performance: Object.freeze({
    maxRenderRequestRateHz: 0,
  }),
  sampling: Object.freeze({
    trueSampleRefreshIntervalMs: 32,
    trueNormalRefreshIntervalMs: 96,
    maxFastSampleOffsetPx: 6,
    rawPointerFallbackWindowMs: 12,
  }),
});
