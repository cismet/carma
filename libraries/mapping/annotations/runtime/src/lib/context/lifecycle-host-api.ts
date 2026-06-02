import type { AnnotationToolId } from "@carma-mapping/annotations/core";

export type RuntimeLifecycleHostApi = {
  requestModeChange: (toolId: AnnotationToolId) => void;
  requestActivateTool: (toolId?: AnnotationToolId) => void;
  requestFinishMeasurement: () => boolean;
};

export const NOOP_RUNTIME_LIFECYCLE_HOST_API: RuntimeLifecycleHostApi = {
  requestModeChange: () => undefined,
  requestActivateTool: () => undefined,
  requestFinishMeasurement: () => false,
};
