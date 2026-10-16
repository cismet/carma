import type { Point2, ReferenceObjectScalingMode } from "@carma-commons/math";

// Point-move gizmo contract, generic over the engine's vector type.

export type PointMoveGizmoPoint<TVector> = {
  id: string;
  geometryECEF: TVector;
};

export type PointMoveGizmoAxisCandidate<TVector> = {
  id: string;
  direction: TVector;
  color?: string;
  title?: string | null;
};

export type PointMoveGizmoLabels = {
  verticalAxis: string;
  eastAxis: string;
  northAxis: string;
  genericAxis: string;
  outerDisc: string;
  surfacePlane: string;
  freePlane: string;
};

export type PointMoveGizmoRotationDelta<TVector> = {
  pointId: string;
  axisOrigin: TVector;
  rotationNormal: TVector;
  deltaAngleRad: number;
  accumulatedAngleRad: number;
};

export type PointMoveGizmoOptions<TVector> = {
  points: PointMoveGizmoPoint<TVector>[];
  labels: PointMoveGizmoLabels;
  movePointId?: string | null;
  axisDirection?: TVector | null;
  discPlaneNormal?: TVector | null;
  axisTitle?: string | null;
  preferredAxisId?: string | null;
  axisCandidates?: PointMoveGizmoAxisCandidate<TVector>[] | null;
  showRotationHandle?: boolean;
  /** Axis arrows and the axis line; off for nodes held to a plane. Default true. */
  showAxes?: boolean;
  showDisc?: boolean;
  discScalingMode?: ReferenceObjectScalingMode;
  discOutlineScreenPixelRadius?: number;
  /** World mode: periodically re-fit the held world radius to the screen target. */
  discResizeWorldRadiusToScreenTarget?: boolean;
  /** Snap the disc world radius to the 1-2-5 decade series. */
  discQuantizeWorldRadius?: boolean;
  /** Capture the disc world radius at drag start and hold it until the drag ends. */
  freezeDiscScaleDuringDrag?: boolean;
  /**
   * World-radius resizing: the disc re-steps once its apparent size leaves
   * [1/factor, factor] of the target. Default 4.
   */
  discResizeStepFactor?: number;
  /** DOM hairline from the disc centre to its edge, labelled with the world radius. */
  showDiscRadiusLabel?: boolean;
  axisWidthPx?: number;
  outlineWidthPx?: number;
  arrowActiveEdgePx?: number;
  arrowInactiveEdgePx?: number;
  snapPlaneDragToGround?: boolean;
  /**
   * Also hide host geometry registered for the active edit (such as a distance
   * measurement's own lines) from drag surface samples; gizmo helpers always are.
   */
  excludeRegisteredDragSampleOccluders?: boolean;
  radius: number;
  onPointPositionChange?: (
    pointId: string,
    nextPosition: TVector,
    screenPosition?: Point2
  ) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  onAxisDirectionChange?: (
    axisDirection: TVector,
    axisTitle?: string | null
  ) => void;
  onRotationDelta?: (delta: PointMoveGizmoRotationDelta<TVector>) => void;
  onExit?: () => void;
};

export type PointMoveGizmoDragState<TVector> =
  | {
      mode: "translate";
      pointId: string;
      axisOrigin: TVector;
      axisDirection: TVector;
      startAxisParam: number;
      cleanupWindowListeners: () => void;
    }
  | {
      mode: "plane-translate";
      pointId: string;
      planeOrigin: TVector;
      planeNormal: TVector;
      planeBasisX: TVector;
      planeBasisY: TVector;
      startPlanePoint: TVector;
      cleanupWindowListeners: () => void;
    }
  | {
      mode: "rotate";
      pointId: string;
      axisOrigin: TVector;
      rotationNormal: TVector;
      planeBasisX: TVector;
      planeBasisY: TVector;
      lastPlaneAngleRad: number;
      accumulatedDeltaRad: number;
      baseRotationAngleRad: number;
      cleanupWindowListeners: () => void;
    };

export type PointMoveGizmoRotationState<TVector> = {
  pointId: string;
  normal: TVector;
  angleRad: number;
};

export type PointMoveGizmoRotationFrame<TVector> = {
  pointId: string;
  activeAxisId: string;
  normal: TVector;
  baseDirections: Record<string, TVector>;
};
