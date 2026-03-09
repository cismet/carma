import {
  Cartesian3,
  getDegreesFromCartesian,
  getEllipsoidalAltitudeOrZero,
} from "@carma/cesium";

import {
  isPointAnnotationEntry,
  type AnnotationCollection,
  type PointAnnotationEntry,
} from "@carma-mapping/annotations/core";

const MOVE_DELTA_EPSILON = 1e-12;

export const getSelectedPointIds = (
  selectedMeasurementIds: string[],
  pointIds: ReadonlySet<string>
): string[] => selectedMeasurementIds.filter((id) => pointIds.has(id));

export const shouldMoveSelectionAsGroup = (
  pointId: string,
  moveGizmoPointId: string | null,
  selectedPointIds: string[]
): boolean =>
  pointId === moveGizmoPointId &&
  selectedPointIds.length > 1 &&
  selectedPointIds.includes(pointId);

export const computeMoveDelta = (
  nextPosition: Cartesian3,
  currentPosition: Cartesian3
): Cartesian3 | null => {
  const delta = Cartesian3.subtract(
    nextPosition,
    currentPosition,
    new Cartesian3()
  );
  if (Cartesian3.magnitudeSquared(delta) <= MOVE_DELTA_EPSILON) {
    return null;
  }
  return delta;
};

export const applyDeltaToSelectedPoints = (
  annotations: AnnotationCollection,
  selectedPointIdSet: Set<string>,
  delta: Cartesian3
): AnnotationCollection =>
  annotations.map((measurement) => {
    if (
      !isPointAnnotationEntry(measurement) ||
      !selectedPointIdSet.has(measurement.id)
    ) {
      return measurement;
    }

    const movedPosition = Cartesian3.add(
      measurement.geometryECEF,
      delta,
      new Cartesian3()
    );
    const geometryWGS84 = getDegreesFromCartesian(movedPosition);
    const movedAnchor = measurement.verticalOffsetAnchorECEF
      ? Cartesian3.add(
          new Cartesian3(
            measurement.verticalOffsetAnchorECEF.x,
            measurement.verticalOffsetAnchorECEF.y,
            measurement.verticalOffsetAnchorECEF.z
          ),
          delta,
          new Cartesian3()
        )
      : null;

    return {
      ...measurement,
      geometryECEF: movedPosition,
      geometryWGS84: {
        longitude: geometryWGS84.longitude,
        latitude: geometryWGS84.latitude,
        altitude: getEllipsoidalAltitudeOrZero(geometryWGS84.altitude),
      },
      ...(movedAnchor
        ? {
            verticalOffsetAnchorECEF: {
              x: movedAnchor.x,
              y: movedAnchor.y,
              z: movedAnchor.z,
            },
          }
        : {}),
    };
  });

export const hasReferencePointInSelection = (
  annotations: AnnotationCollection,
  selectedPointIdSet: Set<string>,
  referencePoint: Cartesian3 | null,
  epsilonMeters: number
): boolean => {
  if (!referencePoint) return false;

  return annotations.some(
    (measurement): measurement is PointAnnotationEntry =>
      isPointAnnotationEntry(measurement) &&
      selectedPointIdSet.has(measurement.id) &&
      Cartesian3.distance(measurement.geometryECEF, referencePoint) <=
        epsilonMeters
  );
};
