import { useCallback, useMemo } from "react";

import {
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POINT,
  groupPlanarMeasurementGroupsByType,
  type AnnotationCollection,
  type AnnotationEntry,
  type AnnotationMode,
  type PlanarMeasurementGroup,
  type PointAnnotationEntry,
  type PointDistanceRelation,
  type PointMeasurementEntry,
} from "@carma-mapping/annotations/core";

import { useAnnotationCollectionSelectors } from "../base";

type UseAnnotationsCollectionStateOptions = {
  distanceRelations: PointDistanceRelation[];
  planarPolygonGroups: PlanarMeasurementGroup[];
};

const NAVIGATION_ANNOTATION_TYPES: AnnotationMode[] = [
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_DISTANCE,
];

export const useAnnotationsCollectionState = (
  annotations: AnnotationCollection,
  pointEntries: PointAnnotationEntry[],
  pointMeasureEntries: PointMeasurementEntry[],
  {
    distanceRelations,
    planarPolygonGroups,
  }: UseAnnotationsCollectionStateOptions
) => {
  const planarNodeIdSet = useMemo(() => {
    const ids = new Set<string>();
    planarPolygonGroups.forEach((group) => {
      group.nodeIds.forEach((pointId) => {
        if (pointId) {
          ids.add(pointId);
        }
      });
    });
    return ids;
  }, [planarPolygonGroups]);

  const annotationsByType = useCallback(
    (type: AnnotationMode): AnnotationEntry[] => {
      if (type === ANNOTATION_TYPE_POINT) {
        return pointMeasureEntries.filter(
          (measurement) => !measurement.auxiliaryLabelAnchor
        );
      }

      if (type === ANNOTATION_TYPE_DISTANCE) {
        return pointEntries.filter((measurement) => {
          if (measurement.type !== ANNOTATION_TYPE_DISTANCE) {
            return false;
          }
          if (measurement.auxiliaryLabelAnchor) {
            return false;
          }
          if (planarNodeIdSet.has(measurement.id)) {
            return false;
          }
          return true;
        });
      }

      return annotations.filter((measurement) => measurement.type === type);
    },
    [annotations, planarNodeIdSet, pointEntries, pointMeasureEntries]
  );

  const {
    getAnnotationsForNavigation,
    getAnnotationIndexByType,
    getAnnotationOrderByType,
    getNextAnnotationOrderByType,
  } = useAnnotationCollectionSelectors<AnnotationMode, AnnotationEntry>({
    annotationsByType,
    navigationTypes: NAVIGATION_ANNOTATION_TYPES,
  });

  const {
    polylineGroups,
    areaPolygonGroups,
    planarSurfacePolygonGroups,
    verticalPolygonGroups,
  } = useMemo(
    () => groupPlanarMeasurementGroupsByType(planarPolygonGroups),
    [planarPolygonGroups]
  );

  return {
    annotationsByType,
    getAnnotationsForNavigation,
    getAnnotationIndexByType,
    getAnnotationOrderByType,
    getNextAnnotationOrderByType,
    polylineGroups,
    areaPolygonGroups,
    planarSurfacePolygonGroups,
    verticalPolygonGroups,
  };
};

export type AnnotationsCollectionState = ReturnType<
  typeof useAnnotationsCollectionState
>;
