import type { AnnotationToolId } from "@carma-mapping/annotations/core";

import type { AnnotationGeographicCoordinate } from "../store";

export type RuntimeLifecycleHostApi = {
  requestModeChange: (toolId: AnnotationToolId) => void;
  requestActivateTool: (toolId?: AnnotationToolId) => void;
  requestFinishMeasurement: () => boolean;
  /**
   * A click of the active tool at a geographic coordinate, without a
   * pointer: the coordinate takes the path a picked surface point takes,
   * node snapping included. False when the active tool takes no points.
   */
  requestPointAt: (coordinate: AnnotationGeographicCoordinate) => boolean;
};

export const NOOP_RUNTIME_LIFECYCLE_HOST_API: RuntimeLifecycleHostApi = {
  requestModeChange: () => undefined,
  requestActivateTool: () => undefined,
  requestFinishMeasurement: () => false,
  requestPointAt: () => false,
};
