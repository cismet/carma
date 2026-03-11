import { useCallback, type Dispatch, type SetStateAction } from "react";
import {
  Cartesian3,
  getDegreesFromCartesian,
  getEllipsoidalAltitudeOrZero,
  projectPointToHorizontalPlaneAtAnchor,
} from "@carma/cesium";
import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POLYLINE,
  LINEAR_SEGMENT_LINE_MODE_DIRECT,
  buildEdgeRelationIdsForPolygon,
  buildVerticalAutoCloseRectangle,
  computePolylinePlanarAngleSumDeg,
  createPlaneFromThreePoints,
  distancePointToPlane,
  getDistanceRelationId,
  getPointById,
  getPointPositionMap,
  isAreaToolType,
  isPointAnnotationEntry,
  projectPointOntoPlane,
  type AnnotationCollection,
  type AnnotationEntry,
  type AnnotationToolType,
  type LinearSegmentLineMode,
  type NodeChainAnnotation,
  type PolygonAreaType,
  type PointDistanceRelation,
} from "@carma-mapping/annotations/core";

type UseNodeChainPointCreationParams = {
  annotations: AnnotationCollection;
  nodeChainAnnotations: NodeChainAnnotation[];
  distanceRelations: PointDistanceRelation[];
  activeNodeChainAnnotationId: string | null;
  activeToolType: AnnotationToolType;
  defaultPolylineSegmentLineMode: LinearSegmentLineMode;
  polylineVerticalOffsetMeters: number;
  setNodeChainAnnotations: Dispatch<SetStateAction<NodeChainAnnotation[]>>;
  setAnnotations: Dispatch<SetStateAction<AnnotationCollection>>;
  setActiveNodeChainAnnotationId: Dispatch<SetStateAction<string | null>>;
  setDoubleClickChainSourcePointId: Dispatch<SetStateAction<string | null>>;
  resolveDistanceRelationSourcePointId: (pointId: string) => string | null;
  upsertDirectDistanceRelation: (
    sourcePointId: string,
    pointId: string
  ) => void;
  trackMeasurementDraftPointIds: (pointIds: readonly string[]) => void;
  trackMeasurementDraftRelationId: (relationId: string | null) => void;
  clearActiveNodeChainDrawingState: () => void;
  clearMoveGizmo: () => void;
  selectAnnotationById: (id: string | null) => void;
  selectRepresentativeNodeForMeasurementId: (id: string | null) => void;
  orientPlaneTowardSceneCamera: (
    plane: NonNullable<NodeChainAnnotation["plane"]>
  ) => NonNullable<NodeChainAnnotation["plane"]>;
  computePolygonGroupDerivedDataWithCamera: (
    group: NodeChainAnnotation,
    pointById: Map<string, Cartesian3>
  ) => NodeChainAnnotation;
};

const PLANAR_PROMOTION_DISTANCE_THRESHOLD_METERS = 0.2;
const PLANAR_PROMOTION_ANGLE_SUM_THRESHOLD_DEG = 150;

export const useNodeChainPointCreation = ({
  annotations,
  nodeChainAnnotations,
  distanceRelations,
  activeNodeChainAnnotationId,
  activeToolType,
  defaultPolylineSegmentLineMode,
  polylineVerticalOffsetMeters,
  setNodeChainAnnotations,
  setAnnotations,
  setActiveNodeChainAnnotationId,
  setDoubleClickChainSourcePointId,
  resolveDistanceRelationSourcePointId,
  upsertDirectDistanceRelation,
  trackMeasurementDraftPointIds,
  trackMeasurementDraftRelationId,
  clearActiveNodeChainDrawingState,
  clearMoveGizmo,
  selectAnnotationById,
  selectRepresentativeNodeForMeasurementId,
  orientPlaneTowardSceneCamera,
  computePolygonGroupDerivedDataWithCamera,
}: UseNodeChainPointCreationParams) => {
  const handleNodeChainPointCreated = useCallback(
    (newPointId: string, newPointPositionECEF: Cartesian3) => {
      const sourcePointId = resolveDistanceRelationSourcePointId(newPointId);
      const directRelationId = sourcePointId
        ? getDistanceRelationId(sourcePointId, newPointId)
        : null;

      let projectedPointPosition: Cartesian3 | null = null;
      const activeGroupSnapshot =
        (activeNodeChainAnnotationId
          ? nodeChainAnnotations.find(
              (group) => group.id === activeNodeChainAnnotationId
            )
          : null) ?? null;
      const creatingNewGroup =
        !activeGroupSnapshot || Boolean(activeGroupSnapshot.closed);
      const nextActiveGroupId = creatingNewGroup
        ? `node-chain-annotation-${Date.now()}-${newPointId}`
        : activeGroupSnapshot.id;
      const pointByIdSnapshot = getPointPositionMap(annotations, {
        [newPointId]: newPointPositionECEF,
      });
      const isAreaCreation = isAreaToolType(activeToolType);
      const seedTypeForCreation: NodeChainAnnotation["type"] = isAreaCreation
        ? (activeToolType as PolygonAreaType)
        : ANNOTATION_TYPE_POLYLINE;
      const seedSegmentLineMode = isAreaCreation
        ? LINEAR_SEGMENT_LINE_MODE_DIRECT
        : defaultPolylineSegmentLineMode;
      const verticalAutoCloseFromNewPoint = (() => {
        if (!isAreaCreation) return null;

        const candidateNodeIds = creatingNewGroup
          ? sourcePointId &&
            sourcePointId !== newPointId &&
            pointByIdSnapshot.has(sourcePointId)
            ? [sourcePointId, newPointId]
            : [newPointId]
          : [...(activeGroupSnapshot?.nodeIds ?? []), newPointId];

        const candidateType = creatingNewGroup
          ? seedTypeForCreation
          : activeGroupSnapshot?.type ?? ANNOTATION_TYPE_AREA_PLANAR;

        if (candidateType !== ANNOTATION_TYPE_AREA_VERTICAL) return null;
        if (candidateNodeIds.length !== 2) return null;

        return buildVerticalAutoCloseRectangle(
          pointByIdSnapshot,
          candidateNodeIds[0] ?? null,
          candidateNodeIds[1] ?? null
        );
      })();
      const createdVerticalAutoCorners =
        verticalAutoCloseFromNewPoint?.autoCorners;
      const autoClosedAsVerticalRectangle = Boolean(
        verticalAutoCloseFromNewPoint
      );

      trackMeasurementDraftPointIds([
        newPointId,
        ...(createdVerticalAutoCorners?.map(({ id }) => id) ?? []),
      ]);

      if (sourcePointId && !autoClosedAsVerticalRectangle) {
        const relationAlreadyExists = directRelationId
          ? distanceRelations.some(
              (relation) => relation.id === directRelationId
            )
          : false;
        upsertDirectDistanceRelation(sourcePointId, newPointId);
        if (!relationAlreadyExists) {
          trackMeasurementDraftRelationId(directRelationId);
        }
      }

      setNodeChainAnnotations((prev) => {
        const activeGroup =
          (activeNodeChainAnnotationId
            ? prev.find((group) => group.id === activeNodeChainAnnotationId)
            : null) ?? null;

        const pointById = getPointPositionMap(annotations, {
          [newPointId]: newPointPositionECEF,
        });

        if (!activeGroup || activeGroup.closed) {
          const seedNodeIds =
            sourcePointId &&
            sourcePointId !== newPointId &&
            pointById.has(sourcePointId)
              ? [sourcePointId, newPointId]
              : [newPointId];
          const seedType = seedTypeForCreation;

          if (
            isAreaCreation &&
            seedType === ANNOTATION_TYPE_AREA_VERTICAL &&
            seedNodeIds.length === 2 &&
            verticalAutoCloseFromNewPoint
          ) {
            verticalAutoCloseFromNewPoint.autoCorners.forEach(
              ({ id, position }) => {
                pointById.set(id, position);
              }
            );
            const closedNodeIds = [
              ...verticalAutoCloseFromNewPoint.closedNodeIds,
            ];
            const closedEdgeRelationIds = buildEdgeRelationIdsForPolygon(
              closedNodeIds,
              true,
              getDistanceRelationId
            );
            return [
              ...prev,
              computePolygonGroupDerivedDataWithCamera(
                {
                  id: nextActiveGroupId,
                  type: seedTypeForCreation,
                  segmentLineMode: seedSegmentLineMode,
                  verticalOffsetMeters: polylineVerticalOffsetMeters,
                  nodeIds: closedNodeIds,
                  edgeRelationIds: closedEdgeRelationIds,
                  distanceMeasurementStartPointId:
                    closedNodeIds[0] ?? undefined,
                  closed: true,
                  planeLocked: true,
                  areaSquareMeters: 0,
                  verticalityDeg: 0,
                },
                pointById
              ),
            ];
          }

          const seedEdgeRelationIds = buildEdgeRelationIdsForPolygon(
            seedNodeIds,
            false,
            getDistanceRelationId
          );
          return [
            ...prev,
            {
              id: nextActiveGroupId,
              type: seedType,
              segmentLineMode: seedSegmentLineMode,
              verticalOffsetMeters: polylineVerticalOffsetMeters,
              nodeIds: seedNodeIds,
              edgeRelationIds: seedEdgeRelationIds,
              distanceMeasurementStartPointId: seedNodeIds[0] ?? undefined,
              closed: false,
              planeLocked: false,
              areaSquareMeters: 0,
              verticalityDeg: 0,
            },
          ];
        }

        let nextNodeIds = [...activeGroup.nodeIds, newPointId];
        let shouldCloseGroup = activeGroup.closed;
        let nextPlane = activeGroup.plane;
        let nextPlaneLocked = activeGroup.planeLocked;
        let nextPointPosition = newPointPositionECEF;
        const shouldKeepSurfaceSampledVertices =
          isAreaCreation && activeGroup.type === ANNOTATION_TYPE_AREA_GROUND;
        const isPlanarSurface =
          isAreaCreation && activeGroup.type === ANNOTATION_TYPE_AREA_PLANAR;

        if (
          isPlanarSurface &&
          !nextPlaneLocked &&
          activeGroup.nodeIds.length === 1
        ) {
          const firstNodeId = activeGroup.nodeIds[0] ?? null;
          const firstNodePosition = firstNodeId
            ? pointById.get(firstNodeId) ?? null
            : null;
          if (firstNodePosition) {
            nextPointPosition = projectPointToHorizontalPlaneAtAnchor(
              nextPointPosition,
              firstNodePosition
            );
            projectedPointPosition = nextPointPosition;
            pointById.set(newPointId, nextPointPosition);
          }
        }

        if (!shouldKeepSurfaceSampledVertices && nextPlaneLocked && nextPlane) {
          nextPointPosition = projectPointOntoPlane(
            nextPointPosition,
            nextPlane
          );
          projectedPointPosition = nextPointPosition;
          pointById.set(newPointId, nextPointPosition);
        } else if (
          !shouldKeepSurfaceSampledVertices &&
          isPlanarSurface &&
          !nextPlaneLocked &&
          nextNodeIds.length >= 3
        ) {
          const first = pointById.get(nextNodeIds[0] ?? "");
          const second = pointById.get(nextNodeIds[1] ?? "");
          if (first && second) {
            const candidatePlane = createPlaneFromThreePoints(
              first,
              second,
              nextPointPosition
            );
            if (candidatePlane) {
              nextPlane = orientPlaneTowardSceneCamera(candidatePlane);
              nextPlaneLocked = true;
              nextPointPosition = projectPointOntoPlane(
                nextPointPosition,
                nextPlane
              );
              projectedPointPosition = nextPointPosition;
              pointById.set(newPointId, nextPointPosition);
            }
          }
        } else if (
          !shouldKeepSurfaceSampledVertices &&
          !isPlanarSurface &&
          nextNodeIds.length >= 4
        ) {
          const first = pointById.get(nextNodeIds[0] ?? "");
          const second = pointById.get(nextNodeIds[1] ?? "");
          const third = pointById.get(nextNodeIds[2] ?? "");
          if (first && second && third) {
            const candidatePlane = createPlaneFromThreePoints(
              first,
              second,
              third
            );
            if (candidatePlane) {
              const orientedCandidatePlane =
                orientPlaneTowardSceneCamera(candidatePlane);
              const planeDistance = distancePointToPlane(
                nextPointPosition,
                orientedCandidatePlane
              );
              const firstFourPoints = nextNodeIds
                .slice(0, 4)
                .map((pointId) => pointById.get(pointId))
                .filter((point): point is Cartesian3 => Boolean(point));
              const planarAngleSum = computePolylinePlanarAngleSumDeg(
                firstFourPoints,
                orientedCandidatePlane
              );

              if (
                planeDistance <= PLANAR_PROMOTION_DISTANCE_THRESHOLD_METERS &&
                planarAngleSum < PLANAR_PROMOTION_ANGLE_SUM_THRESHOLD_DEG
              ) {
                nextPlane = orientedCandidatePlane;
                nextPlaneLocked = true;
                nextPointPosition = projectPointOntoPlane(
                  nextPointPosition,
                  orientedCandidatePlane
                );
                projectedPointPosition = nextPointPosition;
                pointById.set(newPointId, nextPointPosition);
              }
            }
          }
        }

        if (
          isAreaCreation &&
          activeGroup.type === ANNOTATION_TYPE_AREA_VERTICAL &&
          nextNodeIds.length === 2 &&
          verticalAutoCloseFromNewPoint
        ) {
          verticalAutoCloseFromNewPoint.autoCorners.forEach(
            ({ id, position }) => {
              pointById.set(id, position);
            }
          );
          nextNodeIds = [...verticalAutoCloseFromNewPoint.closedNodeIds];
          shouldCloseGroup = true;
          nextPlaneLocked = true;
        }

        const nextEdgeRelationIds = buildEdgeRelationIdsForPolygon(
          nextNodeIds,
          shouldCloseGroup,
          getDistanceRelationId
        );
        const updatedGroup = computePolygonGroupDerivedDataWithCamera(
          {
            ...activeGroup,
            type: activeGroup.type,
            nodeIds: nextNodeIds,
            edgeRelationIds: nextEdgeRelationIds,
            closed: shouldCloseGroup,
            planeLocked: shouldKeepSurfaceSampledVertices
              ? false
              : nextPlaneLocked,
            plane: shouldKeepSurfaceSampledVertices ? undefined : nextPlane,
          },
          pointById
        );
        return prev.map((group) =>
          group.id === activeGroup.id ? updatedGroup : group
        );
      });

      setActiveNodeChainAnnotationId(nextActiveGroupId);

      if (projectedPointPosition) {
        const geometryWGS84 = getDegreesFromCartesian(projectedPointPosition);
        setAnnotations((prev) =>
          prev.map((measurement) => {
            if (
              !isPointAnnotationEntry(measurement) ||
              measurement.id !== newPointId
            ) {
              return measurement;
            }
            return {
              ...measurement,
              geometryECEF: projectedPointPosition as Cartesian3,
              geometryWGS84: {
                longitude: geometryWGS84.longitude,
                latitude: geometryWGS84.latitude,
                altitude: getEllipsoidalAltitudeOrZero(geometryWGS84.altitude),
              },
            };
          })
        );
      }

      if (createdVerticalAutoCorners && createdVerticalAutoCorners.length > 0) {
        setAnnotations((prev) => {
          const pointEntries = prev.filter(isPointAnnotationEntry);
          const maxPointIndex = pointEntries.reduce(
            (maxIndex, measurement) =>
              Math.max(maxIndex, measurement.index ?? 0),
            0
          );
          const autoCornerEntries: AnnotationEntry[] =
            createdVerticalAutoCorners.map(({ id, position }, index) => {
              const cornerWGS84 = getDegreesFromCartesian(position);
              return {
                type: ANNOTATION_TYPE_DISTANCE,
                id,
                index: maxPointIndex + index + 1,
                geometryECEF: position,
                geometryWGS84: {
                  longitude: cornerWGS84.longitude,
                  latitude: cornerWGS84.latitude,
                  altitude: getEllipsoidalAltitudeOrZero(cornerWGS84.altitude),
                },
                timestamp: Date.now() + index,
              };
            });
          return [...prev, ...autoCornerEntries];
        });
      }

      if (autoClosedAsVerticalRectangle) {
        clearActiveNodeChainDrawingState();
        selectRepresentativeNodeForMeasurementId(nextActiveGroupId);
        clearMoveGizmo();
      } else {
        setDoubleClickChainSourcePointId(newPointId);
        if (!sourcePointId) {
          selectAnnotationById(newPointId);
        }
      }
    },
    [
      activeNodeChainAnnotationId,
      activeToolType,
      annotations,
      nodeChainAnnotations,
      clearActiveNodeChainDrawingState,
      clearMoveGizmo,
      computePolygonGroupDerivedDataWithCamera,
      defaultPolylineSegmentLineMode,
      distanceRelations,
      orientPlaneTowardSceneCamera,
      polylineVerticalOffsetMeters,
      resolveDistanceRelationSourcePointId,
      selectAnnotationById,
      selectRepresentativeNodeForMeasurementId,
      setActiveNodeChainAnnotationId,
      setAnnotations,
      setDoubleClickChainSourcePointId,
      setNodeChainAnnotations,
      trackMeasurementDraftPointIds,
      trackMeasurementDraftRelationId,
      upsertDirectDistanceRelation,
    ]
  );

  const insertExistingNodeIntoActiveChain = useCallback(
    (existingPointId: string, sourcePointId?: string | null) => {
      const isNodeChainTool =
        activeToolType === ANNOTATION_TYPE_POLYLINE ||
        isAreaToolType(activeToolType);
      if (!isNodeChainTool) return false;

      const existingPoint = getPointById(annotations, existingPointId);
      if (!existingPoint || !isPointAnnotationEntry(existingPoint))
        return false;
      const existingPointPosition = existingPoint.geometryECEF;
      const activeGroupSnapshot =
        (activeNodeChainAnnotationId
          ? nodeChainAnnotations.find(
              (group) => group.id === activeNodeChainAnnotationId
            )
          : null) ?? null;
      const creatingNewGroup =
        !activeGroupSnapshot || Boolean(activeGroupSnapshot.closed);
      const nextActiveGroupId = creatingNewGroup
        ? `node-chain-annotation-${Date.now()}-${existingPointId}`
        : activeGroupSnapshot.id;
      const pointByIdSnapshot = getPointPositionMap(annotations);
      const isAreaCreation = isAreaToolType(activeToolType);
      const seedTypeForCreation: NodeChainAnnotation["type"] = isAreaCreation
        ? (activeToolType as PolygonAreaType)
        : ANNOTATION_TYPE_POLYLINE;
      const seedSegmentLineMode = isAreaCreation
        ? LINEAR_SEGMENT_LINE_MODE_DIRECT
        : defaultPolylineSegmentLineMode;
      const verticalAutoCloseFromExistingPoint = (() => {
        if (!isAreaCreation) return null;

        const candidateNodeIds = creatingNewGroup
          ? sourcePointId &&
            sourcePointId !== existingPointId &&
            pointByIdSnapshot.has(sourcePointId)
            ? [sourcePointId, existingPointId]
            : [existingPointId]
          : [...(activeGroupSnapshot?.nodeIds ?? []), existingPointId];

        const candidateType = creatingNewGroup
          ? seedTypeForCreation
          : activeGroupSnapshot?.type ?? ANNOTATION_TYPE_AREA_PLANAR;

        if (candidateType !== ANNOTATION_TYPE_AREA_VERTICAL) return null;
        if (candidateNodeIds.length !== 2) return null;

        return buildVerticalAutoCloseRectangle(
          pointByIdSnapshot,
          candidateNodeIds[0] ?? null,
          candidateNodeIds[1] ?? null
        );
      })();
      const createdVerticalAutoCorners =
        verticalAutoCloseFromExistingPoint?.autoCorners;
      const autoClosedAsVerticalRectangle = Boolean(
        verticalAutoCloseFromExistingPoint
      );

      setNodeChainAnnotations((prev) => {
        const activeGroup =
          (activeNodeChainAnnotationId
            ? prev.find((group) => group.id === activeNodeChainAnnotationId)
            : null) ?? null;
        const pointById = getPointPositionMap(annotations);

        if (!activeGroup || activeGroup.closed) {
          const seedNodeIds =
            sourcePointId &&
            sourcePointId !== existingPointId &&
            pointById.has(sourcePointId)
              ? [sourcePointId, existingPointId]
              : [existingPointId];
          const seedType = seedTypeForCreation;

          if (
            isAreaCreation &&
            seedType === ANNOTATION_TYPE_AREA_VERTICAL &&
            seedNodeIds.length === 2 &&
            verticalAutoCloseFromExistingPoint
          ) {
            verticalAutoCloseFromExistingPoint.autoCorners.forEach(
              ({ id, position }) => {
                pointById.set(id, position);
              }
            );
            const closedNodeIds = [
              ...verticalAutoCloseFromExistingPoint.closedNodeIds,
            ];
            const closedEdgeRelationIds = buildEdgeRelationIdsForPolygon(
              closedNodeIds,
              true,
              getDistanceRelationId
            );
            return [
              ...prev,
              computePolygonGroupDerivedDataWithCamera(
                {
                  id: nextActiveGroupId,
                  type: seedTypeForCreation,
                  segmentLineMode: seedSegmentLineMode,
                  verticalOffsetMeters: polylineVerticalOffsetMeters,
                  nodeIds: closedNodeIds,
                  edgeRelationIds: closedEdgeRelationIds,
                  distanceMeasurementStartPointId:
                    closedNodeIds[0] ?? undefined,
                  closed: true,
                  planeLocked: true,
                  areaSquareMeters: 0,
                  verticalityDeg: 0,
                },
                pointById
              ),
            ];
          }

          const seedEdgeRelationIds = buildEdgeRelationIdsForPolygon(
            seedNodeIds,
            false,
            getDistanceRelationId
          );
          return [
            ...prev,
            {
              id: nextActiveGroupId,
              type: seedType,
              segmentLineMode: seedSegmentLineMode,
              verticalOffsetMeters: polylineVerticalOffsetMeters,
              nodeIds: seedNodeIds,
              edgeRelationIds: seedEdgeRelationIds,
              distanceMeasurementStartPointId: seedNodeIds[0] ?? undefined,
              closed: false,
              planeLocked: false,
              areaSquareMeters: 0,
              verticalityDeg: 0,
            },
          ];
        }

        const lastNodeId =
          activeGroup.nodeIds[activeGroup.nodeIds.length - 1] ?? null;
        if (lastNodeId === existingPointId) {
          return prev;
        }

        let nextNodeIds = [...activeGroup.nodeIds, existingPointId];
        let shouldCloseGroup = activeGroup.closed;
        let nextPlane = activeGroup.plane;
        let nextPlaneLocked = activeGroup.planeLocked;
        const shouldKeepSurfaceSampledVertices =
          isAreaCreation && activeGroup.type === ANNOTATION_TYPE_AREA_GROUND;
        const isPlanarSurface =
          isAreaCreation && activeGroup.type === ANNOTATION_TYPE_AREA_PLANAR;

        if (
          !shouldKeepSurfaceSampledVertices &&
          isPlanarSurface &&
          !nextPlaneLocked &&
          nextNodeIds.length >= 3
        ) {
          const first = pointById.get(nextNodeIds[0] ?? "");
          const second = pointById.get(nextNodeIds[1] ?? "");
          if (first && second) {
            const candidatePlane = createPlaneFromThreePoints(
              first,
              second,
              existingPointPosition
            );
            if (candidatePlane) {
              nextPlane = orientPlaneTowardSceneCamera(candidatePlane);
              nextPlaneLocked = true;
            }
          }
        } else if (
          !shouldKeepSurfaceSampledVertices &&
          !isPlanarSurface &&
          !nextPlaneLocked &&
          nextNodeIds.length >= 4
        ) {
          const first = pointById.get(nextNodeIds[0] ?? "");
          const second = pointById.get(nextNodeIds[1] ?? "");
          const third = pointById.get(nextNodeIds[2] ?? "");
          if (first && second && third) {
            const candidatePlane = createPlaneFromThreePoints(
              first,
              second,
              third
            );
            if (candidatePlane) {
              const orientedCandidatePlane =
                orientPlaneTowardSceneCamera(candidatePlane);
              const planeDistance = distancePointToPlane(
                existingPointPosition,
                orientedCandidatePlane
              );
              const firstFourPoints = nextNodeIds
                .slice(0, 4)
                .map((pointId) => pointById.get(pointId))
                .filter((point): point is Cartesian3 => Boolean(point));
              const planarAngleSum = computePolylinePlanarAngleSumDeg(
                firstFourPoints,
                orientedCandidatePlane
              );

              if (
                planeDistance <= PLANAR_PROMOTION_DISTANCE_THRESHOLD_METERS &&
                planarAngleSum < PLANAR_PROMOTION_ANGLE_SUM_THRESHOLD_DEG
              ) {
                nextPlane = orientedCandidatePlane;
                nextPlaneLocked = true;
              }
            }
          }
        }

        if (
          isAreaCreation &&
          activeGroup.type === ANNOTATION_TYPE_AREA_VERTICAL &&
          nextNodeIds.length === 2 &&
          verticalAutoCloseFromExistingPoint
        ) {
          verticalAutoCloseFromExistingPoint.autoCorners.forEach(
            ({ id, position }) => {
              pointById.set(id, position);
            }
          );
          nextNodeIds = [...verticalAutoCloseFromExistingPoint.closedNodeIds];
          shouldCloseGroup = true;
          nextPlaneLocked = true;
        }

        const nextEdgeRelationIds = buildEdgeRelationIdsForPolygon(
          nextNodeIds,
          shouldCloseGroup,
          getDistanceRelationId
        );
        const updatedGroup = computePolygonGroupDerivedDataWithCamera(
          {
            ...activeGroup,
            type: activeGroup.type,
            nodeIds: nextNodeIds,
            edgeRelationIds: nextEdgeRelationIds,
            closed: shouldCloseGroup,
            planeLocked: shouldKeepSurfaceSampledVertices
              ? false
              : nextPlaneLocked,
            plane: shouldKeepSurfaceSampledVertices ? undefined : nextPlane,
          },
          pointById
        );
        return prev.map((group) =>
          group.id === activeGroup.id ? updatedGroup : group
        );
      });

      if (createdVerticalAutoCorners && createdVerticalAutoCorners.length > 0) {
        setAnnotations((prev) => {
          const pointEntries = prev.filter(isPointAnnotationEntry);
          const maxPointIndex = pointEntries.reduce(
            (maxIndex, measurement) =>
              Math.max(maxIndex, measurement.index ?? 0),
            0
          );
          const autoCornerEntries: AnnotationEntry[] =
            createdVerticalAutoCorners.map(({ id, position }, index) => {
              const cornerWGS84 = getDegreesFromCartesian(position);
              return {
                type: ANNOTATION_TYPE_DISTANCE,
                id,
                index: maxPointIndex + index + 1,
                geometryECEF: position,
                geometryWGS84: {
                  longitude: cornerWGS84.longitude,
                  latitude: cornerWGS84.latitude,
                  altitude: getEllipsoidalAltitudeOrZero(cornerWGS84.altitude),
                },
                timestamp: Date.now() + index,
              };
            });
          return [...prev, ...autoCornerEntries];
        });
      }

      if (autoClosedAsVerticalRectangle) {
        clearActiveNodeChainDrawingState();
        selectRepresentativeNodeForMeasurementId(nextActiveGroupId);
        clearMoveGizmo();
        return true;
      }

      setActiveNodeChainAnnotationId(nextActiveGroupId);
      return true;
    },
    [
      activeNodeChainAnnotationId,
      activeToolType,
      annotations,
      nodeChainAnnotations,
      clearActiveNodeChainDrawingState,
      clearMoveGizmo,
      computePolygonGroupDerivedDataWithCamera,
      defaultPolylineSegmentLineMode,
      orientPlaneTowardSceneCamera,
      polylineVerticalOffsetMeters,
      selectRepresentativeNodeForMeasurementId,
      setActiveNodeChainAnnotationId,
      setAnnotations,
      setNodeChainAnnotations,
    ]
  );

  return {
    handleNodeChainPointCreated,
    insertExistingNodeIntoActiveChain,
  };
};
