import { useCallback } from "react";

import {
  Cartesian3,
  getDegreesFromCartesian,
  getEllipsoidalAltitudeOrZero,
  getPositionFromLocalFrame,
  getPositionInLocalFrame,
  resolveLocalFrameVectors,
  type Scene,
} from "@carma/cesium";
import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_DISTANCE,
  buildEdgeRelationIdsForPolygon,
  computePolygonGroupDerivedData,
  getDistanceRelationId,
  getPointPositionMap,
  isPointAnnotationEntry,
  projectPointOntoPlane,
  type AnnotationCollection,
  type NodeChainAnnotation,
  type PointDistanceRelation,
} from "@carma-mapping/annotations/core";

type UseDistanceRelationEditingParams = {
  scene: Scene | null | undefined;
  annotations: AnnotationCollection;
  nodeChainAnnotations: readonly NodeChainAnnotation[];
  setAnnotations: React.Dispatch<React.SetStateAction<AnnotationCollection>>;
  setDistanceRelations: React.Dispatch<
    React.SetStateAction<PointDistanceRelation[]>
  >;
  setNodeChainAnnotations: React.Dispatch<
    React.SetStateAction<NodeChainAnnotation[]>
  >;
  setActiveNodeChainAnnotationId: (id: string | null) => void;
  setDoubleClickChainSourcePointId: (id: string | null) => void;
  selectAnnotationById: (id: string | null) => void;
};

const getOwnerMeasurementForEdgeRelationId = (
  nodeChainAnnotations: readonly NodeChainAnnotation[],
  relationId: string
) =>
  nodeChainAnnotations.find((measurement) =>
    measurement.edgeRelationIds.includes(relationId)
  ) ?? null;

export const useDistanceRelationEditing = ({
  scene,
  annotations,
  nodeChainAnnotations,
  setAnnotations,
  setDistanceRelations,
  setNodeChainAnnotations,
  setActiveNodeChainAnnotationId,
  setDoubleClickChainSourcePointId,
  selectAnnotationById,
}: UseDistanceRelationEditingParams) => {
  const getPreferredPlaneFacingPosition = useCallback((): Cartesian3 | null => {
    if (!scene || scene.isDestroyed()) {
      return null;
    }

    return scene.camera.positionWC;
  }, [scene]);

  const handleDistanceRelationCornerClick = useCallback(
    (relationId: string) => {
      if (!relationId) {
        return;
      }

      setDistanceRelations((previousRelations) =>
        previousRelations.map((relation) => {
          if (relation.id !== relationId) {
            return relation;
          }

          const nextAnchorPointId =
            relation.anchorPointId === relation.pointAId
              ? relation.pointBId
              : relation.pointAId;

          return {
            ...relation,
            anchorPointId: nextAnchorPointId,
          };
        })
      );
    },
    [setDistanceRelations]
  );

  const handleDistanceRelationMidpointClick = useCallback(
    (relationId: string) => {
      if (!relationId) {
        return;
      }

      const targetMeasurement = getOwnerMeasurementForEdgeRelationId(
        nodeChainAnnotations,
        relationId
      );
      if (!targetMeasurement) {
        return;
      }

      const nodeIds = targetMeasurement.nodeIds;
      if (nodeIds.length < 2) {
        return;
      }

      let edgeStartId: string | null = null;
      let edgeEndId: string | null = null;
      let insertIndex = -1;

      for (let index = 0; index < nodeIds.length - 1; index += 1) {
        const startId = nodeIds[index];
        const endId = nodeIds[index + 1];
        if (!startId || !endId) {
          continue;
        }

        if (getDistanceRelationId(startId, endId) === relationId) {
          edgeStartId = startId;
          edgeEndId = endId;
          insertIndex = index + 1;
          break;
        }
      }

      if (!edgeStartId || !edgeEndId) {
        if (targetMeasurement.closed && nodeIds.length >= 3) {
          const startId = nodeIds[nodeIds.length - 1] ?? null;
          const endId = nodeIds[0] ?? null;
          if (
            startId &&
            endId &&
            getDistanceRelationId(startId, endId) === relationId
          ) {
            edgeStartId = startId;
            edgeEndId = endId;
            insertIndex = nodeIds.length;
          }
        }
      }

      if (!edgeStartId || !edgeEndId || insertIndex < 0) {
        return;
      }

      const pointById = getPointPositionMap(annotations);
      const startPoint = pointById.get(edgeStartId);
      const endPoint = pointById.get(edgeEndId);
      if (!startPoint || !endPoint) {
        return;
      }

      let midpointPosition = Cartesian3.midpoint(
        startPoint,
        endPoint,
        new Cartesian3()
      );
      const targetMeasurementVerticalFrame =
        targetMeasurement.type === ANNOTATION_TYPE_AREA_VERTICAL
          ? resolveLocalFrameVectors(targetMeasurement.planarPolygonLocalFrame)
          : null;

      if (targetMeasurementVerticalFrame) {
        const startLocal = getPositionInLocalFrame(
          startPoint,
          targetMeasurementVerticalFrame
        );
        const endLocal = getPositionInLocalFrame(
          endPoint,
          targetMeasurementVerticalFrame
        );
        midpointPosition = getPositionFromLocalFrame(
          targetMeasurementVerticalFrame,
          (startLocal.eastMeters + endLocal.eastMeters) / 2,
          (startLocal.northMeters + endLocal.northMeters) / 2,
          (startLocal.upMeters + endLocal.upMeters) / 2
        );
      }

      if (
        targetMeasurement.type !== ANNOTATION_TYPE_AREA_GROUND &&
        targetMeasurement.planeLocked &&
        targetMeasurement.plane
      ) {
        midpointPosition = projectPointOntoPlane(
          midpointPosition,
          targetMeasurement.plane
        );
      }

      const nextPointId = `point-${Date.now()}-split`;
      const midpointWGS84 = getDegreesFromCartesian(midpointPosition);

      setAnnotations((previousAnnotations) => {
        const insertionBaseIndex =
          previousAnnotations.find(
            (annotation) =>
              isPointAnnotationEntry(annotation) &&
              annotation.id === edgeStartId
          )?.index ?? previousAnnotations.filter(isPointAnnotationEntry).length;
        const insertionIndex = insertionBaseIndex + 1;

        const nextAnnotations = previousAnnotations.map((annotation) => {
          if (
            isPointAnnotationEntry(annotation) &&
            annotation.index >= insertionIndex
          ) {
            return {
              ...annotation,
              index: annotation.index + 1,
            };
          }

          return annotation;
        });

        return [
          ...nextAnnotations,
          {
            type: ANNOTATION_TYPE_DISTANCE,
            id: nextPointId,
            index: insertionIndex,
            geometryECEF: midpointPosition,
            geometryWGS84: {
              longitude: midpointWGS84.longitude,
              latitude: midpointWGS84.latitude,
              altitude: getEllipsoidalAltitudeOrZero(midpointWGS84.altitude),
            },
            timestamp: Date.now(),
          },
        ];
      });

      const updatedPointById = getPointPositionMap(annotations, {
        [nextPointId]: midpointPosition,
      });

      setNodeChainAnnotations((previousMeasurements) =>
        previousMeasurements.map((measurement) => {
          if (measurement.id !== targetMeasurement.id) {
            return measurement;
          }

          const nextNodeIds = [
            ...measurement.nodeIds.slice(0, insertIndex),
            nextPointId,
            ...measurement.nodeIds.slice(insertIndex),
          ];
          const nextEdgeRelationIds = buildEdgeRelationIdsForPolygon(
            nextNodeIds,
            measurement.closed,
            getDistanceRelationId
          );

          return computePolygonGroupDerivedData(
            {
              ...measurement,
              nodeIds: nextNodeIds,
              edgeRelationIds: nextEdgeRelationIds,
            },
            updatedPointById,
            {
              preferredFacingPositionECEF: getPreferredPlaneFacingPosition(),
            }
          );
        })
      );

      setActiveNodeChainAnnotationId(targetMeasurement.id);
      setDoubleClickChainSourcePointId(nextPointId);
      selectAnnotationById(nextPointId);
    },
    [
      annotations,
      getPreferredPlaneFacingPosition,
      nodeChainAnnotations,
      selectAnnotationById,
      setActiveNodeChainAnnotationId,
      setAnnotations,
      setDoubleClickChainSourcePointId,
      setNodeChainAnnotations,
    ]
  );

  return {
    handleDistanceRelationCornerClick,
    handleDistanceRelationMidpointClick,
  };
};

export type DistanceRelationEditingState = ReturnType<
  typeof useDistanceRelationEditing
>;
