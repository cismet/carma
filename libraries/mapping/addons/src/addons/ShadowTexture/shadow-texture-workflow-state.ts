export const isShadowTextureWorkflowActive = (
  enabled: boolean,
  shadowOnly: boolean,
  backgroundVisible: boolean | undefined,
  requestedBackgroundVisible: boolean | undefined
): boolean =>
  requestedBackgroundVisible !== undefined &&
  enabled &&
  shadowOnly &&
  backgroundVisible === requestedBackgroundVisible;
