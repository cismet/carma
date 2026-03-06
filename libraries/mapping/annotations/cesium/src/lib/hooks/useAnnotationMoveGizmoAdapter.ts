import { useMemo } from "react";

import { Cartesian3, type Scene } from "@carma/cesium";
import { useCesiumPointMoveGizmo } from "@carma-mapping/gizmo/cesium";

import { type PointAnnotationEntry } from "../types/AnnotationTypes";

export type AnnotationMoveGizmoAdapterOptions = {
  scene: Scene | null;
  points: PointAnnotationEntry[];
  moveGizmoPointId?: string | null;
  moveGizmoAxisDirection?: Cartesian3 | null;
  moveGizmoAxisTitle?: string | null;
  moveGizmoPreferredAxisId?: string | null;
  moveGizmoAxisCandidates?: Array<{
    id: string;
    direction: Cartesian3;
    color?: string;
    title?: string | null;
  }> | null;
  moveGizmoSnapPlaneDragToGround?: boolean;
  moveGizmoShowRotationHandle?: boolean;
  radius: number;
  onMoveGizmoPointPositionChange?: (
    pointId: string,
    nextPosition: Cartesian3
  ) => void;
  onMoveGizmoDragStateChange?: (isDragging: boolean) => void;
  onMoveGizmoAxisChange?: (
    axisDirection: Cartesian3,
    axisTitle?: string | null
  ) => void;
  onMoveGizmoExit?: () => void;
};

export const useAnnotationMoveGizmoAdapter = ({
  scene,
  points,
  moveGizmoPointId = null,
  moveGizmoAxisDirection = null,
  moveGizmoAxisTitle = null,
  moveGizmoPreferredAxisId = null,
  moveGizmoAxisCandidates = null,
  moveGizmoSnapPlaneDragToGround = false,
  moveGizmoShowRotationHandle = true,
  radius,
  onMoveGizmoPointPositionChange,
  onMoveGizmoDragStateChange,
  onMoveGizmoAxisChange,
  onMoveGizmoExit,
}: AnnotationMoveGizmoAdapterOptions) => {
  const moveGizmoPoints = useMemo(
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
    points: moveGizmoPoints,
    movePointId: moveGizmoPointId,
    axisDirection: moveGizmoAxisDirection,
    axisTitle: moveGizmoAxisTitle,
    preferredAxisId: moveGizmoPreferredAxisId,
    axisCandidates: moveGizmoAxisCandidates,
    snapPlaneDragToGround: moveGizmoSnapPlaneDragToGround,
    showRotationHandle: moveGizmoShowRotationHandle,
    radius,
    onPointPositionChange: onMoveGizmoPointPositionChange,
    onDragStateChange: onMoveGizmoDragStateChange,
    onAxisDirectionChange: onMoveGizmoAxisChange,
    onExit: onMoveGizmoExit,
  });
};
