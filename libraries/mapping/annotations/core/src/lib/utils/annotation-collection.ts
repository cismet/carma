import { Cartesian3 } from "@carma-cesium";

import {
  isPointAnnotationEntry,
  type AnnotationEntry,
  type AnnotationPointEntry,
} from "../types/annotation-cesium-types";
import type { NodeChainAnnotation } from "../types/annotation-types";
import { getCustomPointAnnotationName } from "./annotation-naming";
export const getPointById = (
  annotations: AnnotationEntry[],
  pointId: string
): AnnotationPointEntry | null => {
  const point = annotations.find((measurement) => measurement.id === pointId);
  return point && isPointAnnotationEntry(point) ? point : null;
};

export const getPointPositionMap = (
  annotations: AnnotationEntry[],
  overrides?: Readonly<Record<string, Cartesian3>>
) => {
  const map = new Map<string, Cartesian3>();

  annotations.forEach((measurement) => {
    if (!isPointAnnotationEntry(measurement)) {
      return;
    }
    map.set(measurement.id, measurement.geometryECEF);
  });

  if (overrides) {
    Object.entries(overrides).forEach(([id, position]) => {
      map.set(id, position);
    });
  }

  return map;
};

export const getMeasurementEntryFlyToPoints = (
  measurement: AnnotationEntry
): Cartesian3[] => {
  if (isPointAnnotationEntry(measurement)) {
    return [measurement.geometryECEF];
  }

  if (Array.isArray(measurement.geometryECEF)) {
    return measurement.geometryECEF;
  }

  return [];
};

export const getAnnotationFlyToPointsById = (
  id: string,
  annotations: AnnotationEntry[],
  nodeChainAnnotations: readonly NodeChainAnnotation[]
): Cartesian3[] => {
  if (!id) {
    return [];
  }

  const pointById = getPointPositionMap(annotations);
  const multiNodeAnnotation =
    nodeChainAnnotations.find((entry) => entry.id === id) ?? null;
  if (multiNodeAnnotation) {
    return multiNodeAnnotation.nodeIds
      .map((pointId) => pointById.get(pointId) ?? null)
      .filter((point): point is Cartesian3 => Boolean(point));
  }

  const annotation = annotations.find((entry) => entry.id === id);
  if (!annotation) {
    return [];
  }

  return getMeasurementEntryFlyToPoints(annotation);
};

export const getLastCustomPointAnnotationName = (
  annotations: AnnotationEntry[]
): string | undefined => {
  for (let index = annotations.length - 1; index >= 0; index -= 1) {
    const annotation = annotations[index];
    if (!annotation || !isPointAnnotationEntry(annotation)) {
      continue;
    }

    const customName = getCustomPointAnnotationName(annotation.name);
    if (customName) {
      return customName;
    }
  }

  return undefined;
};
