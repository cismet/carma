import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cartesian3FromGeographicCoordinate,
  geographicCoordinateFromCartesian3,
  createPlaneBasis,
  normalizeDirection,
} from "@carma-mapping/engines/cesium/core";
import {
  useCesiumPointMoveGizmo,
  type CesiumMoveGizmoAxisCandidate,
} from "@carma-mapping/gizmo/cesium";
import { Cartesian3 } from "@carma-cesium";

import {
  updateNodeCoordinateById,
  type AnnotationsStore,
  type RuntimeLinkedNodeGroup,
  type RuntimeNode,
} from "../store";
import type { RuntimeScene } from "../types/runtimeScene.types";
const NODE_GIZMO_RADIUS_METERS = 3;
const REFERENCE_LINE_AXIS_ID_PARALLEL = "reference-line-parallel";
const REFERENCE_LINE_AXIS_ID_SECONDARY = "reference-line-secondary";
const REFERENCE_LINE_AXIS_ID_TERTIARY = "reference-line-tertiary";

const REFERENCE_LINE_AXIS_CANDIDATE_COLORS = {
  primary: "rgba(59, 130, 246, 0.98)",
  secondary: "rgba(34, 197, 94, 0.98)",
  tertiary: "rgba(239, 68, 68, 0.98)",
} as const;

type MoveGizmoAxisOverride = {
  axisDirection: Cartesian3;
  axisTitle: string;
  preferredAxisId: string;
  axisCandidates: CesiumMoveGizmoAxisCandidate[];
};

const createReferenceLineAxisOverride = (
  lineDirection: Cartesian3
): MoveGizmoAxisOverride | null => {
  const normalizedLineDirection = normalizeDirection(lineDirection);
  if (!normalizedLineDirection) {
    return null;
  }

  const planeBasis = createPlaneBasis(normalizedLineDirection);

  return {
    axisDirection: normalizedLineDirection,
    axisTitle: "Punkt parallel zur Referenzlinie verschieben",
    preferredAxisId: REFERENCE_LINE_AXIS_ID_PARALLEL,
    axisCandidates: [
      {
        id: REFERENCE_LINE_AXIS_ID_PARALLEL,
        direction: normalizedLineDirection,
        color: REFERENCE_LINE_AXIS_CANDIDATE_COLORS.primary,
        title: "Punkt parallel zur Referenzlinie verschieben",
      },
      {
        id: REFERENCE_LINE_AXIS_ID_SECONDARY,
        direction: Cartesian3.clone(planeBasis.xAxis),
        color: REFERENCE_LINE_AXIS_CANDIDATE_COLORS.secondary,
        title: "Punkt orthogonal zur Referenzlinie verschieben",
      },
      {
        id: REFERENCE_LINE_AXIS_ID_TERTIARY,
        direction: Cartesian3.clone(planeBasis.yAxis),
        color: REFERENCE_LINE_AXIS_CANDIDATE_COLORS.tertiary,
        title: "Punkt entlang der aktiven Referenzebene verschieben",
      },
    ],
  };
};

type UsePointEditingGizmoOptions = {
  annotationsStore: AnnotationsStore;
  onActiveMoveGizmoNodeIdChange?: (nodeId: string | null) => void;
};

export const usePointEditingGizmo = (
  scene: RuntimeScene | null,
  nodes: readonly RuntimeNode[],
  _linkedNodeGroups: readonly RuntimeLinkedNodeGroup[],
  {
    annotationsStore,
    onActiveMoveGizmoNodeIdChange,
  }: UsePointEditingGizmoOptions
) => {
  const isNodeLocked = useCallback(
    (nodeId: string) =>
      annotationsStore
        .getState()
        .annotationEntries.some(
          (annotationEntry) =>
            annotationEntry.locked && annotationEntry.nodeIds.includes(nodeId)
        ),
    [annotationsStore]
  );
  const [activeMoveGizmoNodeId, setActiveMoveGizmoNodeId] = useState<
    string | null
  >(null);
  const [axisOverride, setAxisOverride] = useState<MoveGizmoAxisOverride | null>(
    null
  );

  const handleNodeLongPress = useCallback(
    (nodeId: string, _measurementId?: string) => {
      if (isNodeLocked(nodeId)) {
        return;
      }

      setAxisOverride(null);
      setActiveMoveGizmoNodeId(nodeId);
    },
    [isNodeLocked]
  );

  const nodesById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node] as const)),
    [nodes]
  );

  const handleReferenceNodeClick = useCallback(
    (referenceNodeId: string) => {
      if (!activeMoveGizmoNodeId) {
        return false;
      }

      const activeNode = nodesById.get(activeMoveGizmoNodeId);
      const referenceNode = nodesById.get(referenceNodeId);
      if (!activeNode || !referenceNode) {
        return false;
      }

      if (activeNode.id !== referenceNode.id) {
        annotationsStore.dispatch(
          updateNodeCoordinateById({
            nodeId: activeNode.id,
            coordinate: {
              ...activeNode.coordinate,
              altitude: referenceNode.coordinate.altitude,
            },
            selectedMeasurementIds:
              annotationsStore.getState().selectionState.selectedAnnotationIds,
          })
        );
      }

      return true;
    },
    [activeMoveGizmoNodeId, annotationsStore, nodesById]
  );

  const handleReferenceEdgeClick = useCallback(
    (startNodeId: string, endNodeId: string) => {
      if (!activeMoveGizmoNodeId) {
        return false;
      }

      const startNode = nodesById.get(startNodeId);
      const endNode = nodesById.get(endNodeId);
      if (!startNode || !endNode) {
        return false;
      }

      const startPoint = cartesian3FromGeographicCoordinate(startNode.coordinate);
      const endPoint = cartesian3FromGeographicCoordinate(endNode.coordinate);
      const axisOverrideFromLine = createReferenceLineAxisOverride(
        Cartesian3.subtract(endPoint, startPoint, new Cartesian3())
      );
      if (!axisOverrideFromLine) {
        return false;
      }

      setAxisOverride(axisOverrideFromLine);
      return true;
    },
    [activeMoveGizmoNodeId, nodesById]
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
    axisDirection: axisOverride?.axisDirection ?? null,
    axisTitle: axisOverride?.axisTitle ?? null,
    preferredAxisId: axisOverride?.preferredAxisId ?? null,
    axisCandidates: axisOverride?.axisCandidates ?? null,
    radius: NODE_GIZMO_RADIUS_METERS,
    showRotationHandle: false,
    snapPlaneDragToGround: true,
    onPointPositionChange: (nodeId, nextPosition) => {
      if (isNodeLocked(nodeId)) {
        return;
      }

      annotationsStore.dispatch(
        updateNodeCoordinateById({
          nodeId,
          coordinate: geographicCoordinateFromCartesian3(nextPosition),
          selectedMeasurementIds:
            annotationsStore.getState().selectionState.selectedAnnotationIds,
        })
      );
    },
    onExit: () => {
      setAxisOverride(null);
      setActiveMoveGizmoNodeId(null);
    },
  });

  useEffect(() => {
    if (!activeMoveGizmoNodeId) {
      return;
    }
    if (
      !nodes.some((node) => node.id === activeMoveGizmoNodeId) ||
      isNodeLocked(activeMoveGizmoNodeId)
    ) {
      setAxisOverride(null);
      setActiveMoveGizmoNodeId(null);
    }
  }, [activeMoveGizmoNodeId, isNodeLocked, nodes]);

  useEffect(() => {
    onActiveMoveGizmoNodeIdChange?.(activeMoveGizmoNodeId);
  }, [activeMoveGizmoNodeId, onActiveMoveGizmoNodeIdChange]);

  return {
    activeMoveGizmoNodeId,
    handleNodeLongPress,
    handleReferenceNodeClick,
    handleReferenceEdgeClick,
  } as const;
};
