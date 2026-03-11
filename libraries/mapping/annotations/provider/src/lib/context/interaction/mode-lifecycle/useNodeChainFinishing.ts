import { useCallback } from "react";

import {
  Cartesian3,
  getDegreesFromCartesian,
  getEllipsoidalAltitudeOrZero,
} from "@carma/cesium";
import {
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POLYLINE,
  buildEdgeRelationIdsForPolygon,
  computePolygonGroupDerivedData,
  getDistanceRelationId,
  getPointPositionMap,
  isAreaToolType,
  isPointAnnotationEntry,
  type AnnotationCollection,
  type AnnotationEntry,
  type AnnotationToolType,
  type NodeChainAnnotation,
  type PolygonAreaType,
} from "@carma-mapping/annotations/core";

type UseNodeChainFinishingParams = {
  sceneCameraPosition: Cartesian3 | null;
  activeToolType: AnnotationToolType;
  activeNodeChainAnnotationId: string | null;
  pendingPolylineRingPromotionPointId: string | null;
  annotations: AnnotationCollection;
  nodeChainAnnotations: readonly NodeChainAnnotation[];
  setAnnotations: React.Dispatch<React.SetStateAction<AnnotationCollection>>;
  setNodeChainAnnotations: React.Dispatch<
    React.SetStateAction<NodeChainAnnotation[]>
  >;
  setPendingPolylineRingPromotionPointId: (id: string | null) => void;
  clearAnnotationCursor: () => void;
  clearActiveNodeChainDrawingState: () => void;
  clearMoveGizmo: () => void;
  selectRepresentativeNodeForMeasurementId: (id: string | null) => void;
};

export const useNodeChainFinishing = ({
  sceneCameraPosition,
  activeToolType,
  activeNodeChainAnnotationId,
  pendingPolylineRingPromotionPointId,
  annotations,
  nodeChainAnnotations,
  setAnnotations,
  setNodeChainAnnotations,
  setPendingPolylineRingPromotionPointId,
  clearAnnotationCursor,
  clearActiveNodeChainDrawingState,
  clearMoveGizmo,
  selectRepresentativeNodeForMeasurementId,
}: UseNodeChainFinishingParams) => {
  const computePolygonGroupDerivedDataWithCamera = useCallback(
    (group: NodeChainAnnotation, pointById: Map<string, Cartesian3>) =>
      computePolygonGroupDerivedData(group, pointById, {
        preferredFacingPositionECEF: sceneCameraPosition,
      }),
    [sceneCameraPosition]
  );

  const closeActivePolygonAnnotation = useCallback(
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

  const closeActivePolylineAnnotationAsRing = useCallback(
    (ringClosurePointId: string) => {
      if (!activeNodeChainAnnotationId) {
        return;
      }

      const finishedGroupId = activeNodeChainAnnotationId;
      clearAnnotationCursor();

      setNodeChainAnnotations((previousMeasurements) => {
        const pointById = getPointPositionMap(annotations);
        return previousMeasurements.map((measurement) => {
          if (
            measurement.id !== activeNodeChainAnnotationId ||
            measurement.closed
          ) {
            return measurement;
          }
          if (measurement.nodeIds.length < 3) {
            return measurement;
          }

          const lastPointId =
            measurement.nodeIds[measurement.nodeIds.length - 1] ?? null;
          const nextNodeIds =
            lastPointId === ringClosurePointId
              ? [...measurement.nodeIds]
              : [...measurement.nodeIds, ringClosurePointId];
          const nextEdgeRelationIds = buildEdgeRelationIdsForPolygon(
            nextNodeIds,
            false,
            getDistanceRelationId
          );

          return computePolygonGroupDerivedDataWithCamera(
            {
              ...measurement,
              closed: false,
              edgeRelationIds: nextEdgeRelationIds,
              nodeIds: nextNodeIds,
            },
            pointById
          );
        });
      });

      selectRepresentativeNodeForMeasurementId(finishedGroupId);
    },
    [
      activeNodeChainAnnotationId,
      annotations,
      clearAnnotationCursor,
      computePolygonGroupDerivedDataWithCamera,
      selectRepresentativeNodeForMeasurementId,
      setNodeChainAnnotations,
    ]
  );

  const confirmPolylineRingPromotion = useCallback(
    (type: PolygonAreaType) => {
      if (!pendingPolylineRingPromotionPointId) {
        return;
      }

      setPendingPolylineRingPromotionPointId(null);
      closeActivePolygonAnnotation(type);
    },
    [
      closeActivePolygonAnnotation,
      pendingPolylineRingPromotionPointId,
      setPendingPolylineRingPromotionPointId,
    ]
  );

  const cancelPolylineRingPromotion = useCallback(() => {
    if (!pendingPolylineRingPromotionPointId) {
      return;
    }

    const ringClosurePointId = pendingPolylineRingPromotionPointId;
    setPendingPolylineRingPromotionPointId(null);
    closeActivePolylineAnnotationAsRing(ringClosurePointId);
  }, [
    closeActivePolylineAnnotationAsRing,
    pendingPolylineRingPromotionPointId,
    setPendingPolylineRingPromotionPointId,
  ]);

  const finishActivePolylineAnnotation = useCallback(() => {
    if (!activeNodeChainAnnotationId) {
      return;
    }

    const finishedGroupId = activeNodeChainAnnotationId;
    clearAnnotationCursor();
    selectRepresentativeNodeForMeasurementId(finishedGroupId);
  }, [
    activeNodeChainAnnotationId,
    clearAnnotationCursor,
    selectRepresentativeNodeForMeasurementId,
  ]);

  const handlePointQueryDoubleClick = useCallback(() => {
    if (
      (activeToolType === ANNOTATION_TYPE_POLYLINE ||
        isAreaToolType(activeToolType)) &&
      activeNodeChainAnnotationId
    ) {
      const activeOpenMeasurement =
        nodeChainAnnotations.find(
          (measurement) =>
            measurement.id === activeNodeChainAnnotationId &&
            !measurement.closed
        ) ?? null;
      const firstNodeId = activeOpenMeasurement?.nodeIds[0] ?? null;
      const canCloseRing = Boolean(
        firstNodeId &&
          activeOpenMeasurement &&
          activeOpenMeasurement.nodeIds.length >= 3
      );

      if (canCloseRing && firstNodeId) {
        if (activeToolType !== ANNOTATION_TYPE_POLYLINE) {
          closeActivePolygonAnnotation();
        } else {
          finishActivePolylineAnnotation();
        }
        return;
      }
    }

    finishActivePolylineAnnotation();
  }, [
    activeNodeChainAnnotationId,
    activeToolType,
    closeActivePolygonAnnotation,
    finishActivePolylineAnnotation,
    nodeChainAnnotations,
  ]);

  return {
    cancelPolylineRingPromotion,
    closeActivePolygonAnnotation,
    confirmPolylineRingPromotion,
    finishActivePolylineAnnotation,
    handlePointQueryDoubleClick,
  };
};

export type NodeChainFinishingState = ReturnType<typeof useNodeChainFinishing>;
