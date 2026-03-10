import { useCallback, type Dispatch, type SetStateAction } from "react";
import {
  Cartesian3,
  getDegreesFromCartesian,
  getEllipsoidalAltitudeOrZero,
} from "@carma/cesium";
import {
  isPointAnnotationEntry,
  type AnnotationCollection,
} from "@carma-mapping/annotations/core";

type UseAnnotationPointEditingControllerParams = {
  moveGizmoPointId: string | null;
  setAnnotations: Dispatch<SetStateAction<AnnotationCollection>>;
  setReferencePoint: Dispatch<SetStateAction<Cartesian3 | null>>;
  referencePointSyncEpsilonMeters: number;
};

export type UpdatePointMeasurementPositionOptions = {
  treatNextPositionAsOffsetAnchor?: boolean;
};

export const useAnnotationPointEditingController = (
  annotations: AnnotationCollection,
  referencePoint: Cartesian3 | null,
  {
    moveGizmoPointId,
    setAnnotations,
    setReferencePoint,
    referencePointSyncEpsilonMeters,
  }: UseAnnotationPointEditingControllerParams
) => {
  const updatePointMeasurementPositionById = useCallback(
    (
      id: string,
      nextPosition: Cartesian3,
      options?: UpdatePointMeasurementPositionOptions
    ) => {
      const measurementToUpdate = annotations.find(
        (measurement) =>
          isPointAnnotationEntry(measurement) && measurement.id === id
      );
      const pointMeasurementToUpdate =
        measurementToUpdate && isPointAnnotationEntry(measurementToUpdate)
          ? measurementToUpdate
          : null;
      const shouldTreatAsAnchor =
        options?.treatNextPositionAsOffsetAnchor === true &&
        Boolean(pointMeasurementToUpdate?.verticalOffsetAnchorECEF);
      const currentAnchor =
        shouldTreatAsAnchor &&
        pointMeasurementToUpdate?.verticalOffsetAnchorECEF
          ? new Cartesian3(
              pointMeasurementToUpdate.verticalOffsetAnchorECEF.x,
              pointMeasurementToUpdate.verticalOffsetAnchorECEF.y,
              pointMeasurementToUpdate.verticalOffsetAnchorECEF.z
            )
          : null;
      const resolvedNextGeometry =
        shouldTreatAsAnchor && currentAnchor && pointMeasurementToUpdate
          ? Cartesian3.add(
              nextPosition,
              Cartesian3.subtract(
                pointMeasurementToUpdate.geometryECEF,
                currentAnchor,
                new Cartesian3()
              ),
              new Cartesian3()
            )
          : nextPosition;
      const shouldSyncReferencePoint = Boolean(
        referencePoint &&
          pointMeasurementToUpdate &&
          Cartesian3.distance(
            pointMeasurementToUpdate.geometryECEF,
            referencePoint
          ) <= referencePointSyncEpsilonMeters
      );
      const geometryWGS84 = getDegreesFromCartesian(resolvedNextGeometry);

      setAnnotations((prev) => {
        let hasChanged = false;

        const next = prev.map((measurement) => {
          if (!isPointAnnotationEntry(measurement) || measurement.id !== id) {
            return measurement;
          }

          hasChanged = true;
          return {
            ...measurement,
            geometryECEF: resolvedNextGeometry,
            geometryWGS84: {
              longitude: geometryWGS84.longitude,
              latitude: geometryWGS84.latitude,
              altitude: getEllipsoidalAltitudeOrZero(geometryWGS84.altitude),
            },
            ...(shouldTreatAsAnchor
              ? {
                  verticalOffsetAnchorECEF: {
                    x: nextPosition.x,
                    y: nextPosition.y,
                    z: nextPosition.z,
                  },
                }
              : {}),
          };
        });

        return hasChanged ? next : prev;
      });

      if (shouldSyncReferencePoint) {
        setReferencePoint(resolvedNextGeometry);
      }
    },
    [
      annotations,
      referencePoint,
      referencePointSyncEpsilonMeters,
      setAnnotations,
      setReferencePoint,
    ]
  );

  const setPointAnnotationElevationById = useCallback(
    (id: string, elevationMeters: number) => {
      if (!Number.isFinite(elevationMeters)) return;

      const measurement = annotations.find(
        (entry) => isPointAnnotationEntry(entry) && entry.id === id
      );
      if (!measurement || !isPointAnnotationEntry(measurement)) return;

      const nextPosition = Cartesian3.fromDegrees(
        measurement.geometryWGS84.longitude,
        measurement.geometryWGS84.latitude,
        elevationMeters
      );
      updatePointMeasurementPositionById(id, nextPosition);
    },
    [annotations, updatePointMeasurementPositionById]
  );

  const setPointAnnotationCoordinatesById = useCallback(
    (
      id: string,
      latitude: number,
      longitude: number,
      elevationMeters?: number
    ) => {
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

      const measurement = annotations.find(
        (entry) => isPointAnnotationEntry(entry) && entry.id === id
      );
      if (!measurement || !isPointAnnotationEntry(measurement)) return;

      const nextElevation =
        elevationMeters ?? measurement.geometryWGS84.altitude ?? 0;
      const nextPosition = Cartesian3.fromDegrees(
        longitude,
        latitude,
        nextElevation
      );
      updatePointMeasurementPositionById(id, nextPosition);
    },
    [annotations, updatePointMeasurementPositionById]
  );

  const setMoveGizmoPointElevationFromMeasurementById = useCallback(
    (sourcePointId: string) => {
      if (!moveGizmoPointId || sourcePointId === moveGizmoPointId) return;

      const sourceMeasurement = annotations.find(
        (measurement) =>
          isPointAnnotationEntry(measurement) &&
          measurement.id === sourcePointId
      );
      const moveMeasurement = annotations.find(
        (measurement) =>
          isPointAnnotationEntry(measurement) &&
          measurement.id === moveGizmoPointId
      );

      if (
        !sourceMeasurement ||
        !moveMeasurement ||
        !isPointAnnotationEntry(sourceMeasurement) ||
        !isPointAnnotationEntry(moveMeasurement)
      ) {
        return;
      }

      const nextPosition = Cartesian3.fromDegrees(
        moveMeasurement.geometryWGS84.longitude,
        moveMeasurement.geometryWGS84.latitude,
        sourceMeasurement.geometryWGS84.altitude
      );
      updatePointMeasurementPositionById(moveGizmoPointId, nextPosition);
    },
    [moveGizmoPointId, annotations, updatePointMeasurementPositionById]
  );

  return {
    updatePointMeasurementPositionById,
    setPointAnnotationElevationById,
    setPointAnnotationCoordinatesById,
    setMoveGizmoPointElevationFromMeasurementById,
  };
};
