import { useMemo } from "react";

import { Cartesian3, type Scene } from "@carma/cesium";
import { useCesiumPointMoveGizmo } from "@carma-mapping/gizmo/cesium";
import { type PointAnnotationEntry } from "@carma-mapping/annotations/core";

export type PointMoveGizmoAdapterOptions = {
  scene: Scene | null;
  points: PointAnnotationEntry[];
  pointId?: string | null;
  axisDirection?: Cartesian3 | null;
  axisTitle?: string | null;
  preferredAxisId?: string | null;
  axisCandidates?: Array<{
    id: string;
    direction: Cartesian3;
    color?: string;
    title?: string | null;
  }> | null;
  snapPlaneDragToGround?: boolean;
  showRotationHandle?: boolean;
  radius: number;
  onPointPositionChange?: (pointId: string, nextPosition: Cartesian3) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  onAxisChange?: (axisDirection: Cartesian3, axisTitle?: string | null) => void;
  onExit?: () => void;
};

export const usePointMoveGizmoAdapter = ({
  scene,
  points,
  pointId = null,
  axisDirection = null,
  axisTitle = null,
  preferredAxisId = null,
  axisCandidates = null,
  snapPlaneDragToGround = false,
  showRotationHandle = true,
  radius,
  onPointPositionChange,
  onDragStateChange,
  onAxisChange,
  onExit,
}: PointMoveGizmoAdapterOptions) => {
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
    movePointId: pointId,
    axisDirection,
    axisTitle,
    preferredAxisId,
    axisCandidates,
    snapPlaneDragToGround,
    showRotationHandle,
    radius,
    onPointPositionChange,
    onDragStateChange,
    onAxisDirectionChange: onAxisChange,
    onExit,
  });
};
