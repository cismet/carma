export const pointQueryDebugDefaults = Object.freeze({
  formatting: Object.freeze({
    figureSpace: " ",
  }),
  performance: Object.freeze({
    idleResetMs: 300,
    reportIntervalMs: 250,
  }),
  history: Object.freeze({
    maxTelemetryEntryCount: 600,
    maxTangentPlaneFailureCount: 200,
    maxDiscOriginJumpCount: 200,
    maxDiscScaleChangeCount: 200,
  }),
  discOriginJump: Object.freeze({
    pixelResolutionMultiplier: 100,
  }),
  discScaleChange: Object.freeze({
    relativeThreshold: 0.2,
  }),
  failedPickLog: Object.freeze({
    throttleMs: 250,
    screenBucketPx: 8,
  }),
});
