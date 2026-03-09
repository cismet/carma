import { useMemo } from "react";

import { type Cartesian3, type Scene } from "@carma/cesium";
import {
  isPointAnnotationEntry,
  type AnnotationCollection,
} from "@carma-mapping/annotations/core";
import { usePointMoveGizmoAdapter } from "./gizmo/usePointMoveGizmoAdapter";

export type PointEditingGizmoOptions = {
  scene: Scene | null;
  annotations: AnnotationCollection;
  pointRadius: number;
  moveGizmoPointId: string | null;
  moveGizmoAxisDirection: Cartesian3 | null;
  moveGizmoPreferredAxisId: string | null;
  moveGizmoSnapPlaneDragToGround: boolean;
  moveGizmoAxisTitle?: string | null;
  moveGizmoAxisCandidates?: Array<{
    id: string;
    direction: Cartesian3;
    color?: string;
    title?: string | null;
  }> | null;
  handleMoveGizmoPointPositionChange: (
    pointId: string,
    nextPosition: Cartesian3
  ) => void;
  setIsMoveGizmoDragging: (isDragging: boolean) => void;
  handleMoveGizmoAxisChange: (
    axisDirection: Cartesian3,
    axisTitle?: string | null
  ) => void;
  handleMoveGizmoExit: () => void;
};

export const usePointEditingGizmo = ({
  scene,
  annotations,
  pointRadius,
  moveGizmoPointId,
  moveGizmoAxisDirection,
  moveGizmoPreferredAxisId,
  moveGizmoSnapPlaneDragToGround,
  moveGizmoAxisTitle = null,
  moveGizmoAxisCandidates = null,
  handleMoveGizmoPointPositionChange,
  setIsMoveGizmoDragging,
  handleMoveGizmoAxisChange,
  handleMoveGizmoExit,
}: PointEditingGizmoOptions) => {
  const points = useMemo(
    () => annotations.filter(isPointAnnotationEntry),
    [annotations]
  );

  usePointMoveGizmoAdapter({
    scene,
    points,
    pointId: moveGizmoPointId,
    axisDirection: moveGizmoAxisDirection,
    axisTitle: moveGizmoAxisTitle,
    preferredAxisId: moveGizmoPreferredAxisId,
    axisCandidates: moveGizmoAxisCandidates,
    snapPlaneDragToGround: moveGizmoSnapPlaneDragToGround,
    showRotationHandle: false,
    radius: pointRadius,
    onPointPositionChange: handleMoveGizmoPointPositionChange,
    onDragStateChange: setIsMoveGizmoDragging,
    onAxisChange: handleMoveGizmoAxisChange,
    onExit: handleMoveGizmoExit,
  });
};
