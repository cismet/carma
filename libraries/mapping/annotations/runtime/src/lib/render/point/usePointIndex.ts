import { useMemo } from "react";

import {
  isPointAnnotationEntry,
  type AnnotationCollection,
  type PointAnnotationEntry,
} from "@carma-mapping/annotations/core";

export const usePointIndex = (annotations: AnnotationCollection) => {
  const points = useMemo(
    () => annotations.filter(isPointAnnotationEntry),
    [annotations]
  );
  const pointIds = useMemo(
    () => new Set(points.map((point) => point.id)),
    [points]
  );

  const pointsById = useMemo(() => {
    const map = new Map<string, PointAnnotationEntry>();
    points.forEach((point) => {
      map.set(point.id, point);
    });
    return map;
  }, [points]);

  return {
    points,
    pointIds,
    pointsById,
  };
};
