import { useCallback, useEffect, useMemo, useState } from "react";

import { Cartesian3 } from "@carma-cesium";

import type {
  CesiumGizmoPoint,
  UseCesiumPointMoveGizmoOptions,
} from "./useCesiumPointMoveGizmo";
const DEFAULT_MOVE_POINT_ID = "demo-point";

export type UseCesiumPointMoveGizmoConnectorOptions = {
  initialPoint: Cartesian3;
  movePointId?: string;
  onPointPositionChange?: (pointId: string, nextPosition: Cartesian3) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  onAxisDirectionChange?: (
    axisDirection: Cartesian3,
    axisTitle?: string | null
  ) => void;
};

export type CesiumPointMoveGizmoConnector = {
  pointPosition: Cartesian3;
  setPointPosition: (nextPosition: Cartesian3) => void;
  dragging: boolean;
  activeAxisDirection: Cartesian3 | null;
  activeAxisTitle: string | null;
  gizmoBinding: Pick<
    UseCesiumPointMoveGizmoOptions,
    | "points"
    | "movePointId"
    | "onPointPositionChange"
    | "onDragStateChange"
    | "onAxisDirectionChange"
    | "onExit"
  >;
};

export const useCesiumPointMoveGizmoConnector = ({
  initialPoint,
  movePointId = DEFAULT_MOVE_POINT_ID,
  onPointPositionChange,
  onDragStateChange,
  onAxisDirectionChange,
}: UseCesiumPointMoveGizmoConnectorOptions): CesiumPointMoveGizmoConnector => {
  const [pointPosition, setPointPositionState] = useState<Cartesian3>(
    Cartesian3.clone(initialPoint)
  );
  const [dragging, setDragging] = useState(false);
  const [activeAxisDirection, setActiveAxisDirection] =
    useState<Cartesian3 | null>(null);
  const [activeAxisTitle, setActiveAxisTitle] = useState<string | null>(null);

  useEffect(() => {
    setPointPositionState(Cartesian3.clone(initialPoint));
  }, [initialPoint]);

  const setPointPosition = useCallback((nextPosition: Cartesian3) => {
    setPointPositionState(Cartesian3.clone(nextPosition));
  }, []);

  const handlePointPositionChange = useCallback(
    (pointId: string, nextPosition: Cartesian3) => {
      const clonedNextPosition = Cartesian3.clone(nextPosition);
      setPointPositionState(clonedNextPosition);
      onPointPositionChange?.(pointId, clonedNextPosition);
    },
    [onPointPositionChange]
  );

  const handleDragStateChange = useCallback(
    (isDragging: boolean) => {
      setDragging(isDragging);
      onDragStateChange?.(isDragging);
    },
    [onDragStateChange]
  );

  const handleAxisDirectionChange = useCallback(
    (axisDirection: Cartesian3, axisTitle?: string | null) => {
      const clonedAxisDirection = Cartesian3.clone(axisDirection);
      setActiveAxisDirection(clonedAxisDirection);
      setActiveAxisTitle(axisTitle ?? null);
      onAxisDirectionChange?.(clonedAxisDirection, axisTitle);
    },
    [onAxisDirectionChange]
  );

  const points = useMemo<CesiumGizmoPoint[]>(
    () => [{ id: movePointId, geometryECEF: pointPosition }],
    [movePointId, pointPosition]
  );

  const handleExit = useCallback(() => {
    setDragging(false);
  }, []);

  const gizmoBinding = useMemo(
    () => ({
      points,
      movePointId,
      onPointPositionChange: handlePointPositionChange,
      onDragStateChange: handleDragStateChange,
      onAxisDirectionChange: handleAxisDirectionChange,
      onExit: handleExit,
    }),
    [
      handleAxisDirectionChange,
      handleDragStateChange,
      handleExit,
      handlePointPositionChange,
      movePointId,
      points,
    ]
  );

  return {
    pointPosition,
    setPointPosition,
    dragging,
    activeAxisDirection,
    activeAxisTitle,
    gizmoBinding,
  };
};

export default useCesiumPointMoveGizmoConnector;
