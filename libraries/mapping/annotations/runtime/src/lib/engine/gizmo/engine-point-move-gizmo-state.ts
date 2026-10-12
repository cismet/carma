import { Matrix4, type Vector3 } from "three";

import {
  createSteppedScreenScaler,
  type SteppedScreenScaler,
} from "@carma-commons/math";

import type {
  AnnotationGizmoAxisCandidate,
  AnnotationGizmoPoint,
  AnnotationPointMoveGizmoOptions,
  AnnotationScenePrimitiveHandle,
} from "../annotation-engine.types";
import type { EngineRotationAxisVisualizer } from "./engine-rotation-axis-visualizer";

export type AxisDragState =
  | {
      mode: "translate";
      pointId: string;
      axisOrigin: Vector3;
      axisDirection: Vector3;
      startAxisParam: number;
      cleanupWindowListeners: () => void;
    }
  | {
      mode: "plane-translate";
      pointId: string;
      planeOrigin: Vector3;
      planeNormal: Vector3;
      planeBasisX: Vector3;
      planeBasisY: Vector3;
      startPlanePoint: Vector3;
      cleanupWindowListeners: () => void;
    }
  | {
      mode: "rotate";
      pointId: string;
      axisOrigin: Vector3;
      rotationNormal: Vector3;
      planeBasisX: Vector3;
      planeBasisY: Vector3;
      lastPlaneAngleRad: number;
      accumulatedDeltaRad: number;
      baseRotationAngleRad: number;
      cleanupWindowListeners: () => void;
    };

export type AxisScreenDirection = { x: number; y: number; angleRad: number };

/** Options the gizmo reads at event time; synced after every commit. */
export type PointMoveGizmoSyncedOptions = Pick<
  AnnotationPointMoveGizmoOptions,
  | "onPointPositionChange"
  | "onDragStateChange"
  | "onAxisDirectionChange"
  | "onRotationDelta"
  | "onExit"
> & {
  radius: number;
  freezeDiscScaleDuringDrag: boolean;
  stepFactor: number;
  showDiscRadiusLabel: boolean;
  axisDirection: Vector3 | null;
  discPlaneNormal: Vector3 | null;
  preferredAxisId: string | null;
  axisCandidates: AnnotationGizmoAxisCandidate[] | null;
};

/** Mutable state shared by the gizmo hooks, created once per mount. */
export type PointMoveGizmoState = PointMoveGizmoSyncedOptions & {
  axisVisualizer: EngineRotationAxisVisualizer | null;
  discVisualizer: AnnotationScenePrimitiveHandle | null;
  readonly discModelMatrix: Matrix4;
  removeDiscFrameListener: (() => void) | null;
  dragState: AxisDragState | null;
  isDragging: boolean;
  suppressNextSceneClick: boolean;
  clearInitialSceneClickGuardTimeout: number | null;
  movePoint: AnnotationGizmoPoint | null;
  /** Positions published during a drag, ahead of the React commit. */
  readonly livePointPositions: Map<string, Vector3>;
  rotationState: { pointId: string; normal: Vector3; angleRad: number } | null;
  rotationFrame: {
    pointId: string;
    activeAxisId: string;
    normal: Vector3;
    baseDirections: Record<string, Vector3>;
  } | null;
  readonly discSteppedScaler: SteppedScreenScaler;
  frozenDragDiscRadius: number | null;
  radiusHairlineGeometry: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null;
  radiusLabelText: string;
  restoreGlobalCursor: (() => void) | null;
  axisScreenDirection: Record<string, AxisScreenDirection>;
  axisAnchorDistance: Record<string, number>;
  activeAxisId: string;
};

export const createPointMoveGizmoState = (
  options: PointMoveGizmoSyncedOptions
): PointMoveGizmoState => ({
  ...options,
  axisVisualizer: null,
  discVisualizer: null,
  discModelMatrix: new Matrix4(),
  removeDiscFrameListener: null,
  dragState: null,
  isDragging: false,
  suppressNextSceneClick: false,
  clearInitialSceneClickGuardTimeout: null,
  movePoint: null,
  livePointPositions: new Map(),
  rotationState: null,
  rotationFrame: null,
  discSteppedScaler: createSteppedScreenScaler(),
  frozenDragDiscRadius: null,
  radiusHairlineGeometry: null,
  radiusLabelText: "",
  restoreGlobalCursor: null,
  axisScreenDirection: {},
  axisAnchorDistance: {},
  activeAxisId: "vertical",
});
