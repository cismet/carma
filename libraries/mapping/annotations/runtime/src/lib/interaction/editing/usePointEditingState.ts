import {
  useCallback,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_POLYLINE,
  applyDeltaToSelectedPoints,
  computeMoveDelta,
  getPointPositionMap,
  getSelectedPointIds,
  hasReferencePointInSelection,
  isPointAnnotationEntry,
  shouldMoveSelectionAsGroup,
  type AnnotationCollection,
  type NodeChainAnnotation,
} from "@carma-mapping/annotations/core";
import { Cartesian3 } from "@carma-cesium";
import {
  getDegreesFromCartesian,
  getEllipsoidalAltitudeOrZero,
  getLocalUpDirectionAtAnchor,
  getPositionWithVerticalOffsetFromAnchor,
  normalizeDirection,
} from "@carma-mapping/engines/cesium/core";

import type { MoveGizmoSession } from "./annotationEdit.types";
import { usePointEditingController } from "./usePointEditingController";
const REFERENCE_POINT_SYNC_EPSILON_METERS = 0.001;
const VERTICAL_POLYGON_AXIS_ALIGNMENT_DOT_EPSILON = 0.999;
const VERTICAL_POLYGON_EN_MATCH_EPSILON_METERS = 0.05;
const VERTICAL_POLYGON_AXIS_ID_ENU_EAST = "enu-east";
const VERTICAL_POLYGON_AXIS_ID_ENU_NORTH = "enu-north";

type PointEditingStateOptions = {
  setAnnotations: Dispatch<SetStateAction<AnnotationCollection>>;
  setNodeChainAnnotations: Dispatch<SetStateAction<NodeChainAnnotation[]>>;
  setReferencePoint: Dispatch<SetStateAction<Cartesian3 | null>>;
  moveGizmo: MoveGizmoSession;
};

export const usePointEditingState = (
  annotations: AnnotationCollection,
  nodeChainAnnotations: readonly NodeChainAnnotation[],
  referencePoint: Cartesian3 | null,
  selectedAnnotationIds: readonly string[],
  {
    setAnnotations,
    setNodeChainAnnotations,
    setReferencePoint,
    moveGizmo,
  }: PointEditingStateOptions
) => {
  const selectablePointIds = useMemo(
    () =>
      new Set(
        annotations
          .filter(isPointAnnotationEntry)
          .map((measurement) => measurement.id)
      ),
    [annotations]
  );
  const lockedAnnotationIdSet = useMemo(() => {
    const ids = new Set<string>();
    annotations.forEach((measurement) => {
      if (measurement.locked) {
        ids.add(measurement.id);
      }
    });
    return ids;
  }, [annotations]);

  const {
    updatePointAnnotationPositionById,
    setPointAnnotationElevationById,
    setPointAnnotationCoordinatesById,
    setMoveGizmoPointElevationFromAnnotationId,
  } = usePointEditingController(annotations, referencePoint, {
    moveGizmoPointId: moveGizmo.pointId,
    setAnnotations,
    setReferencePoint,
    referencePointSyncEpsilonMeters: REFERENCE_POINT_SYNC_EPSILON_METERS,
  });

  const handleMoveGizmoPointPositionChange = useCallback(
    (pointId: string, nextPosition: Cartesian3) => {
      const movedPointMeasurement = annotations.find(
        (measurement) =>
          isPointAnnotationEntry(measurement) && measurement.id === pointId
      );
      if (
        !movedPointMeasurement ||
        !isPointAnnotationEntry(movedPointMeasurement) ||
        lockedAnnotationIdSet.has(pointId)
      ) {
        return;
      }

      const selectedPointIds = getSelectedPointIds(
        [...selectedAnnotationIds],
        selectablePointIds
      ).filter((id) => !lockedAnnotationIdSet.has(id));
      const moveSelectionAsGroup = shouldMoveSelectionAsGroup(
        pointId,
        moveGizmo.pointId,
        selectedPointIds
      );

      const movedPointAnchor = movedPointMeasurement.verticalOffsetAnchorECEF
        ? new Cartesian3(
            movedPointMeasurement.verticalOffsetAnchorECEF.x,
            movedPointMeasurement.verticalOffsetAnchorECEF.y,
            movedPointMeasurement.verticalOffsetAnchorECEF.z
          )
        : null;
      const currentMoveOrigin =
        movedPointAnchor ?? movedPointMeasurement.geometryECEF;
      const delta = computeMoveDelta(nextPosition, currentMoveOrigin);

      const targetVerticalPolygonGroup =
        nodeChainAnnotations.find(
          (group) =>
            group.closed &&
            group.type === ANNOTATION_TYPE_AREA_VERTICAL &&
            group.nodeIds.includes(pointId)
        ) ?? null;
      const moveNorthAxisCandidate =
        moveGizmo.axisCandidates?.find(
          (candidate) => candidate.id === VERTICAL_POLYGON_AXIS_ID_ENU_NORTH
        ) ??
        moveGizmo.axisCandidates?.find(
          (candidate) => candidate.id === "horizontal-north"
        ) ??
        null;
      const moveEastAxisCandidate =
        moveGizmo.axisCandidates?.find(
          (candidate) => candidate.id === VERTICAL_POLYGON_AXIS_ID_ENU_EAST
        ) ??
        moveGizmo.axisCandidates?.find(
          (candidate) => candidate.id === "horizontal-east"
        ) ??
        null;
      const normalizedActiveAxisDirection = moveGizmo.axisDirection
        ? normalizeDirection(moveGizmo.axisDirection)
        : null;
      const normalizedNorthAxisDirection = moveNorthAxisCandidate
        ? normalizeDirection(moveNorthAxisCandidate.direction)
        : null;
      const normalizedEastAxisDirection = moveEastAxisCandidate
        ? normalizeDirection(moveEastAxisCandidate.direction)
        : null;
      const isVerticalPolygonNorthAxisActive = Boolean(
        targetVerticalPolygonGroup &&
          normalizedActiveAxisDirection &&
          normalizedNorthAxisDirection &&
          Math.abs(
            Cartesian3.dot(
              normalizedActiveAxisDirection,
              normalizedNorthAxisDirection
            )
          ) >= VERTICAL_POLYGON_AXIS_ALIGNMENT_DOT_EPSILON
      );

      const verticalPolygonCoupledPointIdSet = new Set<string>();
      if (
        targetVerticalPolygonGroup &&
        isVerticalPolygonNorthAxisActive &&
        normalizedNorthAxisDirection &&
        normalizedEastAxisDirection
      ) {
        const pointById = getPointPositionMap(annotations);
        targetVerticalPolygonGroup.nodeIds.forEach((candidatePointId) => {
          if (!candidatePointId || candidatePointId === pointId) {
            return;
          }
          if (lockedAnnotationIdSet.has(candidatePointId)) {
            return;
          }

          const candidatePosition = pointById.get(candidatePointId);
          if (!candidatePosition) {
            return;
          }

          const candidateDelta = Cartesian3.subtract(
            candidatePosition,
            movedPointMeasurement.geometryECEF,
            new Cartesian3()
          );
          const deltaE = Cartesian3.dot(
            candidateDelta,
            normalizedEastAxisDirection
          );
          const deltaN = Cartesian3.dot(
            candidateDelta,
            normalizedNorthAxisDirection
          );
          if (
            Math.abs(deltaE) <= VERTICAL_POLYGON_EN_MATCH_EPSILON_METERS &&
            Math.abs(deltaN) <= VERTICAL_POLYGON_EN_MATCH_EPSILON_METERS
          ) {
            verticalPolygonCoupledPointIdSet.add(candidatePointId);
          }
        });
      }

      if (movedPointAnchor && moveGizmo.verticalOffsetEditMode) {
        const deltaFromAnchor = Cartesian3.subtract(
          nextPosition,
          movedPointAnchor,
          new Cartesian3()
        );
        const nextOffsetMeters = Cartesian3.dot(
          deltaFromAnchor,
          getLocalUpDirectionAtAnchor(movedPointAnchor)
        );

        if (moveGizmo.verticalOffsetEditMode === ANNOTATION_TYPE_POLYLINE) {
          const targetNodeChainAnnotationId =
            moveGizmo.verticalOffsetNodeChainAnnotationId ??
            nodeChainAnnotations.find(
              (group) => !group.closed && group.nodeIds.includes(pointId)
            )?.id ??
            null;

          if (targetNodeChainAnnotationId) {
            const targetGroup = nodeChainAnnotations.find(
              (group) => group.id === targetNodeChainAnnotationId
            );
            if (targetGroup) {
              const targetVertexIdSet = new Set(targetGroup.nodeIds);
              setNodeChainAnnotations((previousGroups) =>
                previousGroups.map((group) =>
                  group.id === targetNodeChainAnnotationId
                    ? {
                        ...group,
                        verticalOffsetMeters: nextOffsetMeters,
                      }
                    : group
                )
              );
              setAnnotations((previousAnnotations) =>
                previousAnnotations.map((measurement) => {
                  if (
                    !isPointAnnotationEntry(measurement) ||
                    !targetVertexIdSet.has(measurement.id) ||
                    !measurement.verticalOffsetAnchorECEF
                  ) {
                    return measurement;
                  }

                  const anchorECEF = new Cartesian3(
                    measurement.verticalOffsetAnchorECEF.x,
                    measurement.verticalOffsetAnchorECEF.y,
                    measurement.verticalOffsetAnchorECEF.z
                  );
                  const nextGeometry = getPositionWithVerticalOffsetFromAnchor(
                    anchorECEF,
                    nextOffsetMeters
                  );
                  const nextWGS84 = getDegreesFromCartesian(nextGeometry);

                  return {
                    ...measurement,
                    geometryECEF: nextGeometry,
                    geometryWGS84: {
                      longitude: nextWGS84.longitude,
                      latitude: nextWGS84.latitude,
                      altitude: getEllipsoidalAltitudeOrZero(
                        nextWGS84.altitude
                      ),
                    },
                  };
                })
              );
              return;
            }
          }
        }

        const nextGeometry = getPositionWithVerticalOffsetFromAnchor(
          movedPointAnchor,
          nextOffsetMeters
        );
        const nextWGS84 = getDegreesFromCartesian(nextGeometry);
        setAnnotations((previousAnnotations) =>
          previousAnnotations.map((measurement) => {
            if (
              !isPointAnnotationEntry(measurement) ||
              measurement.id !== pointId
            ) {
              return measurement;
            }

            return {
              ...measurement,
              geometryECEF: nextGeometry,
              geometryWGS84: {
                longitude: nextWGS84.longitude,
                latitude: nextWGS84.latitude,
                altitude: getEllipsoidalAltitudeOrZero(nextWGS84.altitude),
              },
            };
          })
        );

        if (
          referencePoint &&
          Cartesian3.distance(
            movedPointMeasurement.geometryECEF,
            referencePoint
          ) <= REFERENCE_POINT_SYNC_EPSILON_METERS
        ) {
          setReferencePoint(nextGeometry);
        }
        return;
      }

      if (!moveSelectionAsGroup) {
        updatePointAnnotationPositionById(pointId, nextPosition, {
          treatNextPositionAsOffsetAnchor: true,
        });
        return;
      }

      if (!delta) {
        return;
      }

      updatePointAnnotationPositionById(pointId, nextPosition, {
        treatNextPositionAsOffsetAnchor: true,
      });

      const selectedPointIdSet = new Set(
        selectedPointIds.filter((selectedId) => selectedId !== pointId)
      );
      verticalPolygonCoupledPointIdSet.forEach((candidatePointId) => {
        if (candidatePointId !== pointId) {
          selectedPointIdSet.add(candidatePointId);
        }
      });
      if (selectedPointIdSet.size === 0) {
        return;
      }

      setAnnotations((previousAnnotations) =>
        applyDeltaToSelectedPoints(
          previousAnnotations,
          selectedPointIdSet,
          delta
        )
      );

      if (
        hasReferencePointInSelection(
          annotations,
          selectedPointIdSet,
          referencePoint,
          REFERENCE_POINT_SYNC_EPSILON_METERS
        ) &&
        referencePoint
      ) {
        const movedReferencePoint = Cartesian3.add(
          referencePoint,
          delta,
          new Cartesian3()
        );
        setReferencePoint(movedReferencePoint);
      }
    },
    [
      annotations,
      lockedAnnotationIdSet,
      moveGizmo,
      nodeChainAnnotations,
      referencePoint,
      selectablePointIds,
      selectedAnnotationIds,
      setAnnotations,
      setNodeChainAnnotations,
      setReferencePoint,
      updatePointAnnotationPositionById,
    ]
  );

  return {
    updatePointAnnotationPositionById,
    setPointAnnotationElevationById,
    setPointAnnotationCoordinatesById,
    setMoveGizmoPointElevationFromAnnotationId,
    handleMoveGizmoPointPositionChange,
  };
};

export type PointEditingState = ReturnType<typeof usePointEditingState>;
