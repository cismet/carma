import { Cartesian2 } from "cesium";

/**
 * Screen projection data for a measurement point
 */
export interface PointProjection {
  id: string;
  canvasPosition: Cartesian2 | null;
  isVisible: boolean;
  isOccluded: boolean;
  isInViewport: boolean;
}

/**
 * Projection state for all measurement points
 */
export type ProjectionState = Record<string, PointProjection>;

/**
 * Extended projection state with camera information
 */
export interface ProjectionStateWithCamera {
  projectionState: ProjectionState;
  cameraPitch: number;
}