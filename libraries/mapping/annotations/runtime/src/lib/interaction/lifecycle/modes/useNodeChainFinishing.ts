import { useCallback } from "react";

import { Cartesian3 } from "@carma/cesium";
import {
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POLYLINE,
  buildEdgeRelationIdsForPolygon,
  computePolygonGroupDerivedData,
  getDistanceRelationId,
  getPointPositionMap,
  isAreaToolType,
  type AnnotationCollection,
  type AnnotationToolType,
  type NodeChainAnnotation,
  type PolygonAreaType,
} from "@carma-mapping/annotations/core";

type UseNodeChainFinishingParams = {
  sceneCameraPosition: Cartesian3 | null;
  activeToolType: AnnotationToolType;
  activeNodeChainAnnotationId: string | null;
  annotations: AnnotationCollection;
  nodeChainAnnotations: readonly NodeChainAnnotation[];
  setNodeChainAnnotations: React.Dispatch<
    React.SetStateAction<NodeChainAnnotation[]>
  >;
  clearAnnotationCursor: () => void;
  clearActiveNodeChainDrawingState: () => void;
  selectRepresentativeNodeForMeasurementId: (id: string | null) => void;
  discardActiveMeasurementDraft: (
    activeNodeChainAnnotationId: string | null
  ) => void;
};

export const useNodeChainFinishing = ({
  sceneCameraPosition,
  activeToolType,
  activeNodeChainAnnotationId,
  annotations,
  nodeChainAnnotations,
  setNodeChainAnnotations,
  clearAnnotationCursor,
  clearActiveNodeChainDrawingState,
  selectRepresentativeNodeForMeasurementId,
  discardActiveMeasurementDraft,
}: UseNodeChainFinishingParams) => {
  const computePolygonGroupDerivedDataWithCamera = useCallback(
    (group: NodeChainAnnotation, pointById: Map<string, Cartesian3>) =>
      computePolygonGroupDerivedData(group, pointById, {
        preferredFacingPositionECEF: sceneCameraPosition,
      }),
    [sceneCameraPosition]
  );

  const finishActivePolygonMeasurement = useCallback(
    (typeOverride?: PolygonAreaType) => {
      let closedGroupId: string | null = null;
      clearAnnotationCursor();

      setNodeChainAnnotations((previousMeasurements) => {
        if (!activeNodeChainAnnotationId) {
          return previousMeasurements;
        }

        const activeMeasurement = previousMeasurements.find(
          (measurement) => measurement.id === activeNodeChainAnnotationId
        );
        if (
          !activeMeasurement ||
          activeMeasurement.closed ||
          activeMeasurement.nodeIds.length < 3
        ) {
          return previousMeasurements;
        }

        const nextClosedType = typeOverride ?? activeMeasurement.type;
        const pointById = getPointPositionMap(annotations);
        const nextEdgeRelationIds = buildEdgeRelationIdsForPolygon(
          activeMeasurement.nodeIds,
          true,
          getDistanceRelationId
        );
        const closedMeasurement = computePolygonGroupDerivedDataWithCamera(
          {
            ...activeMeasurement,
            type: nextClosedType,
            closed: true,
            edgeRelationIds: nextEdgeRelationIds,
          },
          pointById
        );
        closedGroupId = closedMeasurement.id;

        return previousMeasurements.map((measurement) =>
          measurement.id === activeMeasurement.id
            ? closedMeasurement
            : measurement
        );
      });

      if (closedGroupId) {
        clearActiveNodeChainDrawingState();
        selectRepresentativeNodeForMeasurementId(closedGroupId);
      } else {
        clearActiveNodeChainDrawingState();
      }
    },
    [
      activeNodeChainAnnotationId,
      annotations,
      clearActiveNodeChainDrawingState,
      clearAnnotationCursor,
      computePolygonGroupDerivedDataWithCamera,
      selectRepresentativeNodeForMeasurementId,
      setNodeChainAnnotations,
    ]
  );

  const finishActivePolylineMeasurement = useCallback(() => {
    if (!activeNodeChainAnnotationId) {
      return;
    }

    const finishedGroupId = activeNodeChainAnnotationId;
    clearAnnotationCursor();
    clearActiveNodeChainDrawingState();
    selectRepresentativeNodeForMeasurementId(finishedGroupId);
  }, [
    activeNodeChainAnnotationId,
    clearActiveNodeChainDrawingState,
    clearAnnotationCursor,
    selectRepresentativeNodeForMeasurementId,
  ]);

  const handlePointQueryDoubleClick = useCallback(() => {
    if (!activeNodeChainAnnotationId) {
      return;
    }

    const activeOpenMeasurement =
      nodeChainAnnotations.find(
        (measurement) =>
          measurement.id === activeNodeChainAnnotationId && !measurement.closed
      ) ?? null;
    if (!activeOpenMeasurement) return;

    if (activeToolType === ANNOTATION_TYPE_POLYLINE) {
      if (
        activeOpenMeasurement.type !== ANNOTATION_TYPE_POLYLINE ||
        activeOpenMeasurement.nodeIds.length < 2
      ) {
        discardActiveMeasurementDraft(activeOpenMeasurement.id);
        return;
      }

      finishActivePolylineMeasurement();
      return;
    }

    if (activeToolType === ANNOTATION_TYPE_DISTANCE) {
      if (
        activeOpenMeasurement.type !== ANNOTATION_TYPE_DISTANCE ||
        activeOpenMeasurement.nodeIds.length < 2
      ) {
        discardActiveMeasurementDraft(activeOpenMeasurement.id);
        return;
      }

      finishActivePolylineMeasurement();
      return;
    }

    if (!isAreaToolType(activeToolType)) {
      return;
    }

    if (activeOpenMeasurement.nodeIds.length < 3) {
      discardActiveMeasurementDraft(activeOpenMeasurement.id);
      return;
    }

    finishActivePolygonMeasurement();
  }, [
    activeNodeChainAnnotationId,
    activeToolType,
    finishActivePolygonMeasurement,
    discardActiveMeasurementDraft,
    finishActivePolylineMeasurement,
    nodeChainAnnotations,
  ]);

  return {
    finishActivePolygonMeasurement,
    finishActivePolylineMeasurement,
    handlePointQueryDoubleClick,
  };
};

export type NodeChainFinishingState = ReturnType<typeof useNodeChainFinishing>;
