import {
  useCallback,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  Cartesian3,
  getDegreesFromCartesian,
  getEllipsoidalAltitudeOrZero,
  getLocalUpDirectionAtAnchor,
  getPositionWithVerticalOffsetFromAnchor,
  normalizeDirection,
} from "@carma/cesium";
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
  type PlanarMeasurementGroup,
} from "@carma-mapping/annotations/core";
import { useAnnotationPointEditingController } from "../../useAnnotationPointEditingController";
import type {
  MoveGizmoAxisCandidate,
  MoveGizmoVerticalOffsetEditMode,
} from "../../editing/annotationEdit.types";

const REFERENCE_POINT_SYNC_EPSILON_METERS = 0.001;
const VERTICAL_POLYGON_AXIS_ALIGNMENT_DOT_EPSILON = 0.999;
const VERTICAL_POLYGON_EN_MATCH_EPSILON_METERS = 0.05;
const VERTICAL_POLYGON_AXIS_ID_ENU_EAST = "enu-east";
const VERTICAL_POLYGON_AXIS_ID_ENU_NORTH = "enu-north";

type PointEditingStateOptions = {
  setAnnotations: Dispatch<SetStateAction<AnnotationCollection>>;
  setPlanarMeasurements: Dispatch<SetStateAction<PlanarMeasurementGroup[]>>;
  setReferencePoint: Dispatch<SetStateAction<Cartesian3 | null>>;
  moveGizmoPointId: string | null;
  moveGizmoAxisDirection: Cartesian3 | null;
  moveGizmoAxisCandidates: MoveGizmoAxisCandidate[] | null;
  moveGizmoVerticalOffsetEditMode: MoveGizmoVerticalOffsetEditMode;
  moveGizmoVerticalOffsetPlanarMeasurementId: string | null;
};

export const usePointEditingState = (
  annotations: AnnotationCollection,
  planarPolygonGroups: readonly PlanarMeasurementGroup[],
  referencePoint: Cartesian3 | null,
  selectedAnnotationIds: readonly string[],
  {
    setAnnotations,
    setPlanarMeasurements,
    setReferencePoint,
    moveGizmoPointId,
    moveGizmoAxisDirection,
    moveGizmoAxisCandidates,
    moveGizmoVerticalOffsetEditMode,
    moveGizmoVerticalOffsetPlanarMeasurementId,
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
  const lockedMeasurementIdSet = useMemo(() => {
    const ids = new Set<string>();
    annotations.forEach((measurement) => {
      if (measurement.locked) {
        ids.add(measurement.id);
      }
    });
    return ids;
  }, [annotations]);

  const {
    updatePointMeasurementPositionById,
    setPointAnnotationElevationById,
    setPointAnnotationCoordinatesById,
    setMoveGizmoPointElevationFromMeasurementById,
  } = useAnnotationPointEditingController(annotations, referencePoint, {
    moveGizmoPointId,
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
        lockedMeasurementIdSet.has(pointId)
      ) {
        return;
      }

      const selectedPointIds = getSelectedPointIds(
        [...selectedAnnotationIds],
        selectablePointIds
      ).filter((id) => !lockedMeasurementIdSet.has(id));
      const moveSelectionAsGroup = shouldMoveSelectionAsGroup(
        pointId,
        moveGizmoPointId,
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
        planarPolygonGroups.find(
          (group) =>
            group.closed &&
            group.type === ANNOTATION_TYPE_AREA_VERTICAL &&
            group.nodeIds.includes(pointId)
        ) ?? null;
      const moveNorthAxisCandidate =
        moveGizmoAxisCandidates?.find(
          (candidate) => candidate.id === VERTICAL_POLYGON_AXIS_ID_ENU_NORTH
        ) ??
        moveGizmoAxisCandidates?.find(
          (candidate) => candidate.id === "horizontal-north"
        ) ??
        null;
      const moveEastAxisCandidate =
        moveGizmoAxisCandidates?.find(
          (candidate) => candidate.id === VERTICAL_POLYGON_AXIS_ID_ENU_EAST
        ) ??
        moveGizmoAxisCandidates?.find(
          (candidate) => candidate.id === "horizontal-east"
        ) ??
        null;
      const normalizedActiveAxisDirection = moveGizmoAxisDirection
        ? normalizeDirection(moveGizmoAxisDirection)
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
          if (lockedMeasurementIdSet.has(candidatePointId)) {
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

      if (movedPointAnchor && moveGizmoVerticalOffsetEditMode) {
        const deltaFromAnchor = Cartesian3.subtract(
          nextPosition,
          movedPointAnchor,
          new Cartesian3()
        );
        const nextOffsetMeters = Cartesian3.dot(
          deltaFromAnchor,
          getLocalUpDirectionAtAnchor(movedPointAnchor)
        );

        if (moveGizmoVerticalOffsetEditMode === ANNOTATION_TYPE_POLYLINE) {
          const targetPlanarGroupId =
            moveGizmoVerticalOffsetPlanarMeasurementId ??
            planarPolygonGroups.find(
              (group) => !group.closed && group.nodeIds.includes(pointId)
            )?.id ??
            null;

          if (targetPlanarGroupId) {
            const targetGroup = planarPolygonGroups.find(
              (group) => group.id === targetPlanarGroupId
            );
            if (targetGroup) {
              const targetVertexIdSet = new Set(targetGroup.nodeIds);
              setPlanarMeasurements((previousGroups) =>
                previousGroups.map((group) =>
                  group.id === targetPlanarGroupId
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
        updatePointMeasurementPositionById(pointId, nextPosition, {
          treatNextPositionAsOffsetAnchor: true,
        });
        return;
      }

      if (!delta) {
        return;
      }

      updatePointMeasurementPositionById(pointId, nextPosition, {
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
      lockedMeasurementIdSet,
      moveGizmoAxisCandidates,
      moveGizmoAxisDirection,
      moveGizmoPointId,
      moveGizmoVerticalOffsetEditMode,
      moveGizmoVerticalOffsetPlanarMeasurementId,
      planarPolygonGroups,
      referencePoint,
      selectablePointIds,
      selectedAnnotationIds,
      setAnnotations,
      setPlanarMeasurements,
      setReferencePoint,
      updatePointMeasurementPositionById,
    ]
  );

  return {
    updatePointMeasurementPositionById,
    setPointAnnotationElevationById,
    setPointAnnotationCoordinatesById,
    setMoveGizmoPointElevationFromMeasurementById,
    handleMoveGizmoPointPositionChange,
  };
};

export type PointEditingState = ReturnType<typeof usePointEditingState>;
