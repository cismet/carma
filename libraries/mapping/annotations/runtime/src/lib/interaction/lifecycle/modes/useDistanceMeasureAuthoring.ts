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
  getConnectedOpenPolylineGroupIds,
  type DirectLineLabelMode,
  getDistanceRelationId,
  getNextDirectLineLabelMode,
  getPointPositionMap,
  isPointAnnotationEntry,
  projectPointOntoPlane,
  type AnnotationCollection,
  type NodeChainAnnotation,
  type PointDistanceRelation,
  type ReferenceLineLabelKind,
} from "@carma-mapping/annotations/core";

import { createUniqueRuntimeId } from "../../create/createUniqueRuntimeId";

type DistanceMeasureAuthoringDefaultsParams = {
  defaultDistanceRelationLabelVisibility: Record<
    ReferenceLineLabelKind,
    boolean
  >;
  defaultDirectLineLabelMode: DirectLineLabelMode;
};

type DistanceMeasureAuthoringSessionParams = {
  activeNodeChainAnnotationId: string | null;
  focusedNodeChainAnnotationId: string | null;
  nodeChainAnnotations: readonly NodeChainAnnotation[];
};

type DistanceMeasureAuthoringSelectionParams = {
  selectAnnotationById: (id: string | null) => void;
  selectRepresentativeNodeForMeasurementId: (id: string | null) => void;
};

type DistanceMeasureAuthoringTopologyParams = {
  getOwnerGroupIdsForEdgeRelationId: (
    relationId: string | null | undefined
  ) => readonly string[];
};

type DistanceMeasureAuthoringMutationParams = {
  setDistanceRelations: React.Dispatch<
    React.SetStateAction<PointDistanceRelation[]>
  >;
  setAnnotations: React.Dispatch<React.SetStateAction<AnnotationCollection>>;
  setNodeChainAnnotations: React.Dispatch<
    React.SetStateAction<NodeChainAnnotation[]>
  >;
  setActiveNodeChainAnnotationId: (id: string | null) => void;
};

type UseDistanceMeasureAuthoringParams = {
  scene: Scene | null | undefined;
  annotations: AnnotationCollection;
  defaults: DistanceMeasureAuthoringDefaultsParams;
  session: DistanceMeasureAuthoringSessionParams;
  selection: DistanceMeasureAuthoringSelectionParams;
  topology: DistanceMeasureAuthoringTopologyParams;
  mutation: DistanceMeasureAuthoringMutationParams;
};

const getOwnerMeasurementForEdgeRelationId = (
  nodeChainAnnotations: readonly NodeChainAnnotation[],
  relationId: string
) =>
  nodeChainAnnotations.find((measurement) =>
    measurement.edgeRelationIds.includes(relationId)
  ) ?? null;

export const useDistanceMeasureAuthoring = ({
  scene,
  annotations,
  defaults,
  session,
  selection,
  topology,
  mutation,
}: UseDistanceMeasureAuthoringParams) => {
  const { defaultDistanceRelationLabelVisibility, defaultDirectLineLabelMode } =
    defaults;
  const {
    activeNodeChainAnnotationId,
    focusedNodeChainAnnotationId,
    nodeChainAnnotations,
  } = session;
  const { selectAnnotationById, selectRepresentativeNodeForMeasurementId } =
    selection;
  const { getOwnerGroupIdsForEdgeRelationId } = topology;
  const {
    setDistanceRelations,
    setAnnotations,
    setNodeChainAnnotations,
    setActiveNodeChainAnnotationId,
  } = mutation;

  const toggleDistanceRelationLineLabelVisibility = useCallback(
    (relationId: string, kind: ReferenceLineLabelKind) => {
      if (!relationId) {
        return;
      }

      setDistanceRelations((previousRelations) =>
        previousRelations.map((relation) => {
          if (relation.id !== relationId) {
            return relation;
          }

          const currentValue =
            relation.labelVisibilityByKind?.[kind] ??
            defaultDistanceRelationLabelVisibility[kind];

          return {
            ...relation,
            labelVisibilityByKind: {
              ...defaultDistanceRelationLabelVisibility,
              ...(relation.labelVisibilityByKind ?? {}),
              [kind]: !currentValue,
            },
          };
        })
      );
    },
    [defaultDistanceRelationLabelVisibility, setDistanceRelations]
  );

  const handleDistanceRelationLineLabelToggle = useCallback(
    (relationId: string, kind: ReferenceLineLabelKind) => {
      if (!relationId) {
        return;
      }

      const ownerGroupIds = getOwnerGroupIdsForEdgeRelationId(relationId);
      const focusedGroupOwnsRelation =
        !!focusedNodeChainAnnotationId &&
        ownerGroupIds.includes(focusedNodeChainAnnotationId);

      if (ownerGroupIds.length > 0 && !focusedGroupOwnsRelation) {
        const preferredOwnerGroupId =
          (activeNodeChainAnnotationId &&
          ownerGroupIds.includes(activeNodeChainAnnotationId)
            ? activeNodeChainAnnotationId
            : ownerGroupIds[0]) ?? null;
        selectRepresentativeNodeForMeasurementId(preferredOwnerGroupId);
        return;
      }

      if (kind === "direct" && focusedNodeChainAnnotationId) {
        const connectedOpenGroupIds = getConnectedOpenPolylineGroupIds(
          nodeChainAnnotations,
          focusedNodeChainAnnotationId
        );
        if (connectedOpenGroupIds.size > 0) {
          const allRelationIds = new Set<string>();
          nodeChainAnnotations.forEach((measurement) => {
            if (!connectedOpenGroupIds.has(measurement.id)) {
              return;
            }
            measurement.edgeRelationIds.forEach((edgeRelationId) =>
              allRelationIds.add(edgeRelationId)
            );
          });

          if (allRelationIds.size > 0) {
            setDistanceRelations((previousRelations) => {
              const currentMode: DirectLineLabelMode =
                previousRelations.find((relation) => relation.id === relationId)
                  ?.directLabelMode ?? defaultDirectLineLabelMode;
              const nextMode = getNextDirectLineLabelMode(currentMode);

              return previousRelations.map((relation) => {
                if (!allRelationIds.has(relation.id)) {
                  return relation;
                }

                return {
                  ...relation,
                  directLabelMode: nextMode,
                  labelVisibilityByKind: {
                    ...defaultDistanceRelationLabelVisibility,
                    ...(relation.labelVisibilityByKind ?? {}),
                    direct: nextMode !== "none",
                  },
                };
              });
            });
            return;
          }
        }
      }

      toggleDistanceRelationLineLabelVisibility(relationId, kind);
    },
    [
      activeNodeChainAnnotationId,
      defaultDirectLineLabelMode,
      defaultDistanceRelationLabelVisibility,
      focusedNodeChainAnnotationId,
      getOwnerGroupIdsForEdgeRelationId,
      nodeChainAnnotations,
      selectRepresentativeNodeForMeasurementId,
      setDistanceRelations,
      toggleDistanceRelationLineLabelVisibility,
    ]
  );

  const handleDistanceRelationLineClick = useCallback(
    (relationId: string, kind: ReferenceLineLabelKind) => {
      if (!relationId || kind !== "direct") {
        return;
      }

      const ownerGroupIds = getOwnerGroupIdsForEdgeRelationId(relationId);
      const focusedGroupOwnsRelation =
        !!focusedNodeChainAnnotationId &&
        ownerGroupIds.includes(focusedNodeChainAnnotationId);

      if (ownerGroupIds.length > 0) {
        if (focusedGroupOwnsRelation) {
          return;
        }

        const preferredOwnerGroupId =
          (activeNodeChainAnnotationId &&
          ownerGroupIds.includes(activeNodeChainAnnotationId)
            ? activeNodeChainAnnotationId
            : ownerGroupIds[0]) ?? null;
        selectRepresentativeNodeForMeasurementId(preferredOwnerGroupId);
      }
    },
    [
      activeNodeChainAnnotationId,
      focusedNodeChainAnnotationId,
      getOwnerGroupIdsForEdgeRelationId,
      selectRepresentativeNodeForMeasurementId,
    ]
  );

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

  const getPreferredPlaneFacingPosition = useCallback((): Cartesian3 | null => {
    if (!scene || scene.isDestroyed()) {
      return null;
    }

    return scene.camera.positionWC;
  }, [scene]);

  const handleDistanceRelationMidpointClick = useCallback(
    (relationId: string) => {
      if (!relationId) {
        return;
      }

      const targetMeasurement = getOwnerMeasurementForEdgeRelationId(
        nodeChainAnnotations,
        relationId
      );
      if (
        !targetMeasurement ||
        targetMeasurement.type === ANNOTATION_TYPE_DISTANCE
      ) {
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

      const nextPointId = createUniqueRuntimeId("point-split");
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
      selectAnnotationById(nextPointId);
    },
    [
      annotations,
      getPreferredPlaneFacingPosition,
      nodeChainAnnotations,
      selectAnnotationById,
      setActiveNodeChainAnnotationId,
      setAnnotations,
      setNodeChainAnnotations,
    ]
  );

  return {
    handleDistanceRelationLineClick,
    handleDistanceRelationLineLabelToggle,
    handleDistanceRelationCornerClick,
    handleDistanceRelationMidpointClick,
  };
};

export type DistanceMeasureAuthoringState = ReturnType<
  typeof useDistanceMeasureAuthoring
>;
