import { Vector3 } from "three";
import type { Degrees, Meters } from "@carma-units";

import {
  geographicCoordinateFromEcef,
  getEllipsoidalAltitudeOrZero,
} from "../geometry";
import { isPointAnnotationEntry } from "../types/annotation-geometry-types";
import type {
  AnnotationEntry,
  AnnotationPointEntry,
} from "../types/annotation-geometry-types";

const selectionGroupMoveDefaults = Object.freeze({
  deltaMagnitudeSquaredEpsilon: 1e-12,
});

export const getSelectedPointIds = (
  selectedAnnotationIds: string[],
  pointIds: ReadonlySet<string>
): string[] => selectedAnnotationIds.filter((id) => pointIds.has(id));

export const shouldMoveSelectionAsGroup = (
  pointId: string,
  moveGizmoPointId: string | null,
  selectedPointIds: string[]
): boolean =>
  pointId === moveGizmoPointId &&
  selectedPointIds.length > 1 &&
  selectedPointIds.includes(pointId);

export const computeMoveDelta = (
  nextPosition: Vector3,
  currentPosition: Vector3
): Vector3 | null => {
  const delta = new Vector3().subVectors(nextPosition, currentPosition);
  if (
    delta.lengthSq() <= selectionGroupMoveDefaults.deltaMagnitudeSquaredEpsilon
  ) {
    return null;
  }
  return delta;
};

export const applyDeltaToSelectedPoints = (
  annotations: AnnotationEntry[],
  selectedPointIdSet: Set<string>,
  delta: Vector3
): AnnotationEntry[] =>
  annotations.map((measurement) => {
    if (
      !isPointAnnotationEntry(measurement) ||
      !selectedPointIdSet.has(measurement.id)
    ) {
      return measurement;
    }

    const movedPosition = new Vector3().addVectors(
      measurement.geometryECEF,
      delta
    );
    const geometryWGS84 = geographicCoordinateFromEcef(movedPosition);
    const movedAnchor = measurement.verticalOffsetAnchorECEF
      ? new Vector3(
          measurement.verticalOffsetAnchorECEF.x,
          measurement.verticalOffsetAnchorECEF.y,
          measurement.verticalOffsetAnchorECEF.z
        ).add(delta)
      : null;

    return {
      ...measurement,
      geometryECEF: movedPosition,
      geometryWGS84: {
        longitude: geometryWGS84.longitude as Degrees,
        latitude: geometryWGS84.latitude as Degrees,
        altitude: getEllipsoidalAltitudeOrZero(
          geometryWGS84.altitude
        ) as Meters,
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
  annotations: AnnotationEntry[],
  selectedPointIdSet: Set<string>,
  referencePoint: Vector3 | null,
  epsilonMeters: number
): boolean => {
  if (!referencePoint) return false;

  return annotations.some(
    (measurement): measurement is AnnotationPointEntry =>
      isPointAnnotationEntry(measurement) &&
      selectedPointIdSet.has(measurement.id) &&
      measurement.geometryECEF.distanceTo(referencePoint) <= epsilonMeters
  );
};
