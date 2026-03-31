import { useCallback, useEffect, useMemo, useState } from "react";

import {
  cartesian3FromGeographicCoordinate,
  geographicCoordinateFromCartesian3,
} from "@carma-mapping/engines/cesium/api";
import { useCesiumPointMoveGizmo } from "@carma-mapping/gizmo/cesium";

import {
  updateNodeCoordinateById,
  type AnnotationsStore,
  type RuntimeNode,
} from "../store";
import type { RuntimeScene } from "../types/runtimeScene.types";
const NODE_GIZMO_RADIUS_METERS = 3;

type UsePointEditingGizmoOptions = {
  annotationsStore: AnnotationsStore;
  setSelectedAnnotationId: (annotationId: string | null) => void;
  onActiveMoveGizmoNodeIdChange?: (nodeId: string | null) => void;
};

export const usePointEditingGizmo = (
  scene: RuntimeScene | null,
  nodes: readonly RuntimeNode[],
  {
    annotationsStore,
    setSelectedAnnotationId,
    onActiveMoveGizmoNodeIdChange,
  }: UsePointEditingGizmoOptions
) => {
  const [activeMoveGizmoNodeId, setActiveMoveGizmoNodeId] = useState<
    string | null
  >(null);

  const handleNodeLongPress = useCallback(
    (nodeId: string, measurementId: string) => {
      setSelectedAnnotationId(measurementId);
      setActiveMoveGizmoNodeId(nodeId);
    },
    [setSelectedAnnotationId]
  );

  const gizmoPoints = useMemo(
    () =>
      nodes.map((node) => ({
        id: node.id,
        geometryECEF: cartesian3FromGeographicCoordinate(node.coordinate),
      })),
    [nodes]
  );

  useCesiumPointMoveGizmo(scene, {
    points: gizmoPoints,
    movePointId: activeMoveGizmoNodeId,
    radius: NODE_GIZMO_RADIUS_METERS,
    showRotationHandle: false,
    snapPlaneDragToGround: false,
    onPointPositionChange: (nodeId, nextPosition) => {
      annotationsStore.dispatch(
        updateNodeCoordinateById({
          nodeId,
          coordinate: geographicCoordinateFromCartesian3(nextPosition),
        })
      );
    },
    onExit: () => {
      setActiveMoveGizmoNodeId(null);
    },
  });

  useEffect(() => {
    if (!activeMoveGizmoNodeId) {
      return;
    }
    if (!nodes.some((node) => node.id === activeMoveGizmoNodeId)) {
      setActiveMoveGizmoNodeId(null);
    }
  }, [activeMoveGizmoNodeId, nodes]);

  useEffect(() => {
    onActiveMoveGizmoNodeIdChange?.(activeMoveGizmoNodeId);
  }, [activeMoveGizmoNodeId, onActiveMoveGizmoNodeIdChange]);

  return {
    activeMoveGizmoNodeId,
    handleNodeLongPress,
  } as const;
};
