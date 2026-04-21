import type { AnnotationToolType } from "@carma-mapping/annotations/core";

export type RuntimeLifecycleHostApi = {
  requestModeChange: (toolType: AnnotationToolType) => void;
  requestStartMeasurement: (toolType?: AnnotationToolType) => void;
  requestFinishMeasurement: () => boolean;
};

export const NOOP_RUNTIME_LIFECYCLE_HOST_API: RuntimeLifecycleHostApi = {
  requestModeChange: () => undefined,
  requestStartMeasurement: () => undefined,
  requestFinishMeasurement: () => false,
};
