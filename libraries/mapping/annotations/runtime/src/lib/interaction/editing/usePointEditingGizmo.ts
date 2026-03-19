import { useMemo } from "react";

import { Cartesian3, type Scene } from "@carma/cesium";
import {
  isPointAnnotationEntry,
  type AnnotationCollection,
} from "@carma-mapping/annotations/core";
import { useCesiumPointMoveGizmo } from "@carma-mapping/gizmo/cesium";
import type { MoveGizmoSession } from "./annotationEdit.types";

export type PointEditingGizmoOptions = {
  pointRadius: number;
  snapPlaneDragToGround: boolean;
  onPointPositionChange: (pointId: string, nextPosition: Cartesian3) => void;
  onDragStateChange: (isDragging: boolean) => void;
  onAxisChange: (axisDirection: Cartesian3, axisTitle?: string | null) => void;
  onExit: () => void;
};

export const usePointEditingGizmo = (
  scene: Scene | null,
  annotations: AnnotationCollection,
  moveGizmo: Pick<
    MoveGizmoSession,
    | "pointId"
    | "axisDirection"
    | "preferredAxisId"
    | "axisTitle"
    | "axisCandidates"
  >,
  {
    pointRadius,
    snapPlaneDragToGround,
    onPointPositionChange,
    onDragStateChange,
    onAxisChange,
    onExit,
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
    movePointId: moveGizmo.pointId,
    axisDirection: moveGizmo.axisDirection,
    axisTitle: moveGizmo.axisTitle,
    preferredAxisId: moveGizmo.preferredAxisId,
    axisCandidates: moveGizmo.axisCandidates,
    snapPlaneDragToGround,
    showRotationHandle: false,
    radius: pointRadius,
    onPointPositionChange,
    onDragStateChange,
    onAxisDirectionChange: onAxisChange,
    onExit,
  });
};
