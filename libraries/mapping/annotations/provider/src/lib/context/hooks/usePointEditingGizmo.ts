import { useMemo } from "react";

import { Cartesian3, type Scene } from "@carma/cesium";
import {
  isPointAnnotationEntry,
  type AnnotationCollection,
} from "@carma-mapping/annotations/core";
import { useCesiumPointMoveGizmo } from "@carma-mapping/gizmo/cesium";

export type PointEditingGizmoOptions = {
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

export const usePointEditingGizmo = (
  scene: Scene | null,
  annotations: AnnotationCollection,
  {
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
  }: PointEditingGizmoOptions
) => {
  const points = useMemo(
    () => annotations.filter(isPointAnnotationEntry),
    [annotations]
  );

  const gizmoPoints = useMemo(
    () =>
      points.map((point) => {
        if (!point.verticalOffsetAnchorECEF) {
          return point;
        }
        return {
          ...point,
          geometryECEF: new Cartesian3(
            point.verticalOffsetAnchorECEF.x,
            point.verticalOffsetAnchorECEF.y,
            point.verticalOffsetAnchorECEF.z
          ),
        };
      }),
    [points]
  );

  useCesiumPointMoveGizmo(scene, {
    points: gizmoPoints,
    movePointId: moveGizmoPointId,
    axisDirection: moveGizmoAxisDirection,
    axisTitle: moveGizmoAxisTitle,
    preferredAxisId: moveGizmoPreferredAxisId,
    axisCandidates: moveGizmoAxisCandidates,
    snapPlaneDragToGround: moveGizmoSnapPlaneDragToGround,
    showRotationHandle: false,
    radius: pointRadius,
    onPointPositionChange: handleMoveGizmoPointPositionChange,
    onDragStateChange: setIsMoveGizmoDragging,
    onAxisDirectionChange: handleMoveGizmoAxisChange,
    onExit: handleMoveGizmoExit,
  });
};
