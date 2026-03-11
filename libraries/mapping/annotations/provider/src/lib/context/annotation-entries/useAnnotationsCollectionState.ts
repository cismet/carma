import { useCallback, useMemo } from "react";

import {
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POINT,
  type AnnotationCollection,
  type AnnotationEntry,
  type AnnotationMode,
  type NodeChainAnnotation,
  type PointAnnotationEntry,
  type PointMeasurementEntry,
} from "@carma-mapping/annotations/core";

import { useAnnotationCollectionSelectors } from "./useAnnotationCollectionSelectors";

type UseAnnotationsCollectionStateOptions = {
  nodeChainAnnotations: NodeChainAnnotation[];
};

const NAVIGATION_ANNOTATION_TYPES: AnnotationMode[] = [
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_DISTANCE,
];

const deriveNodeChainNodeIdSet = (
  nodeChainAnnotations: NodeChainAnnotation[]
): ReadonlySet<string> => {
  const ids = new Set<string>();
  nodeChainAnnotations.forEach((group) => {
    group.nodeIds.forEach((pointId) => {
      if (pointId) {
        ids.add(pointId);
      }
    });
  });
  return ids;
};

const createAnnotationsByTypeSelector = (
  annotations: AnnotationCollection,
  pointEntries: PointAnnotationEntry[],
  pointMeasureEntries: PointMeasurementEntry[],
  nodeChainNodeIdSet: ReadonlySet<string>
) => {
  return (type: AnnotationMode): AnnotationEntry[] => {
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
        if (nodeChainNodeIdSet.has(measurement.id)) {
          return false;
        }
        return true;
      });
    }

    return annotations.filter((measurement) => measurement.type === type);
  };
};

export const useAnnotationsCollectionState = (
  annotations: AnnotationCollection,
  pointEntries: PointAnnotationEntry[],
  pointMeasureEntries: PointMeasurementEntry[],
  { nodeChainAnnotations }: UseAnnotationsCollectionStateOptions
) => {
  const nodeChainNodeIdSet = useMemo(
    () => deriveNodeChainNodeIdSet(nodeChainAnnotations),
    [nodeChainAnnotations]
  );

  const annotationsByType = useCallback(
    createAnnotationsByTypeSelector(
      annotations,
      pointEntries,
      pointMeasureEntries,
      nodeChainNodeIdSet
    ),
    [annotations, nodeChainNodeIdSet, pointEntries, pointMeasureEntries]
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

  return {
    annotationsByType,
    getAnnotationsForNavigation,
    getAnnotationIndexByType,
    getAnnotationOrderByType,
    getNextAnnotationOrderByType,
  };
};

export type AnnotationsCollectionState = ReturnType<
  typeof useAnnotationsCollectionState
>;
