import { useCallback, useEffect, useMemo } from "react";
import { Cartesian3, type Scene } from "@carma-cesium";
import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import {
  cartesian3FromGeographicCoordinate,
  getDegreesFromCartesian,
  getEllipsoidalAltitudeOrZero,
} from "@carma-mapping/engines/cesium/core";

import { useCursorOverlay } from "../interaction/use-cursor-overlay";
import { usePointEditingGizmo } from "../interaction/use-point-editing-gizmo";
import {
  findAnnotationEntryById,
  insertNodeIntoMeasurementEdge,
  updateAnnotationEntryById,
  type AnnotationsStore,
  type AnnotationNode,
  type AnnotationNodeLink,
  type StoredAnnotation,
} from "../store";
import {
  resolveDistanceTriangleAnchorCoordinateRole,
  resolveDistanceTriangleAnchorCoordinateSelection,
  resolveOppositeDistanceTriangleAnchorCoordinateRole,
} from "../render/distance-triangle-overlay";
import { RUNTIME_POINT_LABEL_COORDINATE_SELECTION } from "../render/measurement-render-models";
import { resolveAnnotationEntryCoordinates } from "../utils/annotation-coordinates";

const {
  POLYLINE: ANNOTATION_TYPE_POLYLINE,
  AREA_GROUND: ANNOTATION_TYPE_AREA_GROUND,
  AREA_PLANAR: ANNOTATION_TYPE_AREA_PLANAR,
  AREA_VERTICAL: ANNOTATION_TYPE_AREA_VERTICAL,
} = ANNOTATION_TYPES;

const isInsertNodeTargetToolType = (toolType: StoredAnnotation["toolType"]) =>
  toolType === ANNOTATION_TYPE_POLYLINE ||
  toolType === ANNOTATION_TYPE_AREA_GROUND ||
  toolType === ANNOTATION_TYPE_AREA_PLANAR ||
  toolType === ANNOTATION_TYPE_AREA_VERTICAL;

const resolveInsertedNodeCoordinate = ({
  toolType,
  startCoordinate,
  endCoordinate,
}: {
  toolType: StoredAnnotation["toolType"];
  startCoordinate: {
    longitude: number;
    latitude: number;
    altitude: number;
  };
  endCoordinate: {
    longitude: number;
    latitude: number;
    altitude: number;
  };
}) => {
  const midpointCoordinate = getDegreesFromCartesian(
    Cartesian3.midpoint(
      cartesian3FromGeographicCoordinate(startCoordinate),
      cartesian3FromGeographicCoordinate(endCoordinate),
      new Cartesian3()
    )
  );

  return {
    longitude: midpointCoordinate.longitude,
    latitude: midpointCoordinate.latitude,
    altitude:
      toolType === ANNOTATION_TYPE_AREA_GROUND
        ? getEllipsoidalAltitudeOrZero(midpointCoordinate.altitude)
        : midpointCoordinate.altitude,
  };
};

type UseVisualInteractionOptions = {
  scene: Scene | null;
  nodes: readonly AnnotationNode[];
  linkedNodeGroups: readonly AnnotationNodeLink[];
  annotationEntries: readonly StoredAnnotation[];
  selectedAnnotationIds: readonly string[];
  annotationsStore: AnnotationsStore;
  activeEditedNodeId: string | null;
  isInteractionToolActive: boolean;
  isMeasurementToolActive: boolean;
  isSelectionAdditiveModifierPressed: boolean;
  onActiveEditedNodeIdChange: (nodeId: string | null) => void;
  onHoveredPointQueryNodeIdChange: (nodeId: string | null) => void;
};

export const useVisualInteraction = ({
  scene,
  nodes,
  linkedNodeGroups,
  annotationEntries,
  selectedAnnotationIds,
  annotationsStore,
  activeEditedNodeId,
  isInteractionToolActive,
  isMeasurementToolActive,
  isSelectionAdditiveModifierPressed,
  onActiveEditedNodeIdChange,
  onHoveredPointQueryNodeIdChange,
}: UseVisualInteractionOptions) => {
  const previewSnapTargetHoverEnabled =
    activeEditedNodeId === null && isMeasurementToolActive;
  const {
    draftNodeCoordinateOverrides,
    effectiveLinkedNodeGroups,
    effectiveNodes,
    handleNodeLongPress,
    isMoveGizmoDragging,
    handleReferenceNodeClick,
    handleReferenceNodeHover,
    handleReferenceEdgeClick,
  } = usePointEditingGizmo(scene, nodes, linkedNodeGroups, {
    annotationsStore,
    annotationEntries,
    selectedAnnotationIds,
    onActiveEditedNodeIdChange,
  });
  const handleDistanceTriangleCornerClick = useCallback(
    (measurementId: string) => {
      const runtimeState = annotationsStore.getState();
      const targetEntry = findAnnotationEntryById(
        runtimeState.annotationEntries,
        measurementId
      );
      if (!targetEntry) {
        return;
      }

      const coordinates = resolveAnnotationEntryCoordinates({
        annotationEntries: runtimeState.annotationEntries,
        nodes: runtimeState.nodes,
        annotationId: measurementId,
      });

      const currentTriangleAnchorCoordinateRole =
        targetEntry.distanceTriangleAnchorCoordinateRole ??
        resolveDistanceTriangleAnchorCoordinateRole(coordinates);

      const nextSelection =
        (targetEntry.distanceAnchorCoordinateSelection ??
          resolveDistanceTriangleAnchorCoordinateSelection(coordinates)) ===
        RUNTIME_POINT_LABEL_COORDINATE_SELECTION.LEFTMOST_SCREEN_SPACE
          ? RUNTIME_POINT_LABEL_COORDINATE_SELECTION.RIGHTMOST_SCREEN_SPACE
          : RUNTIME_POINT_LABEL_COORDINATE_SELECTION.LEFTMOST_SCREEN_SPACE;

      annotationsStore.dispatch(
        updateAnnotationEntryById({
          annotationId: measurementId,
          distanceAnchorCoordinateSelection: nextSelection,
          distanceTriangleAnchorCoordinateRole:
            resolveOppositeDistanceTriangleAnchorCoordinateRole(
              currentTriangleAnchorCoordinateRole
            ),
        })
      );
    },
    [annotationsStore]
  );
  const insertNodeTargetMeasurementIds = useMemo(() => {
    const selectedAnnotationIdSet = new Set(selectedAnnotationIds);

    return annotationEntries
      .filter(
        (annotationEntry) =>
          selectedAnnotationIdSet.has(annotationEntry.id) &&
          !annotationEntry.locked &&
          isInsertNodeTargetToolType(annotationEntry.toolType)
      )
      .map((annotationEntry) => annotationEntry.id);
  }, [annotationEntries, selectedAnnotationIds]);
  const handleInsertNodeTargetClick = useCallback(
    (measurementId: string, startNodeId: string, endNodeId: string) => {
      const runtimeState = annotationsStore.getState();
      const targetEntry = findAnnotationEntryById(
        runtimeState.annotationEntries,
        measurementId
      );
      if (
        !targetEntry ||
        targetEntry.locked ||
        !isInsertNodeTargetToolType(targetEntry.toolType)
      ) {
        return false;
      }

      const startNode = runtimeState.nodes.find(
        (node) => node.id === startNodeId
      );
      const endNode = runtimeState.nodes.find((node) => node.id === endNodeId);
      if (!startNode || !endNode) {
        return false;
      }

      annotationsStore.dispatch(
        insertNodeIntoMeasurementEdge({
          measurementId,
          startNodeId,
          endNodeId,
          coordinate: resolveInsertedNodeCoordinate({
            toolType: targetEntry.toolType,
            startCoordinate: startNode.coordinate,
            endCoordinate: endNode.coordinate,
          }),
        })
      );
      scene?.requestRender();
      return true;
    },
    [annotationsStore, scene]
  );
  const handlePreviewSnapTargetNodeHover = useCallback(
    (nodeId: string, hovered: boolean) => {
      onHoveredPointQueryNodeIdChange(hovered ? nodeId : null);
    },
    [onHoveredPointQueryNodeIdChange]
  );

  useEffect(() => {
    if (previewSnapTargetHoverEnabled) {
      return;
    }

    onHoveredPointQueryNodeIdChange(null);
  }, [onHoveredPointQueryNodeIdChange, previewSnapTargetHoverEnabled]);

  useCursorOverlay(scene, null, {
    enabled: previewSnapTargetHoverEnabled,
  });
  useCursorOverlay(scene, null, {
    enabled: isInteractionToolActive && isSelectionAdditiveModifierPressed,
    variant: "selection-additive-indicator",
  });

  return {
    draftNodeCoordinateOverrides,
    effectiveLinkedNodeGroups,
    effectiveNodes,
    handleDistanceTriangleCornerClick,
    handleInsertNodeTargetClick,
    handleNodeLongPress,
    handlePreviewSnapTargetNodeHover,
    handleReferenceEdgeClick,
    handleReferenceNodeClick,
    handleReferenceNodeHover,
    insertNodeTargetMeasurementIds,
    isMoveGizmoDragging,
    previewSnapTargetHoverEnabled,
  };
};
