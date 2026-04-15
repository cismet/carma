import type { RuntimeToolId } from "../types/runtime-tool.types";

export type RuntimeLifecycleHostApi = {
  requestModeChange: (toolType: RuntimeToolId) => void;
  requestStartMeasurement: (toolType?: RuntimeToolId) => void;
  requestFinishMeasurement: () => boolean;
};

export const NOOP_RUNTIME_LIFECYCLE_HOST_API: RuntimeLifecycleHostApi = {
  requestModeChange: () => undefined,
  requestStartMeasurement: () => undefined,
  requestFinishMeasurement: () => false,
};
