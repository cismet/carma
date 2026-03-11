import type { Dispatch, SetStateAction } from "react";
import type { Scene } from "@carma/cesium";
import type {
  AnnotationCollection,
  NodeChainAnnotation,
  PointMeasurementEntry,
} from "@carma-mapping/annotations/core";
import { isPointAnnotationEntry } from "@carma-mapping/annotations/core";

import { useAnnotationEntryActions } from "./useAnnotationEntryActions";
import { useAnnotationsCollectionState } from "./useAnnotationsCollectionState";
import { useAnnotationFlyToActions } from "../interaction/navigation/useAnnotationFlyToActions";
import { useReferencePointState } from "../interaction/useReferencePointState";

type UseAnnotationCollectionDomainParams = {
  scene: Scene;
  annotations: AnnotationCollection;
  nodeChainAnnotations: NodeChainAnnotation[];
  pointMeasureEntries: PointMeasurementEntry[];
  referencePoint: import("@carma/cesium").Cartesian3 | null;
  setAnnotations: Dispatch<SetStateAction<AnnotationCollection>>;
  setReferencePoint: Dispatch<
    SetStateAction<import("@carma/cesium").Cartesian3 | null>
  >;
  referencePointSyncEpsilonMeters: number;
};

export const useAnnotationCollectionDomain = ({
  scene,
  annotations,
  nodeChainAnnotations,
  pointMeasureEntries,
  referencePoint,
  setAnnotations,
  setReferencePoint,
  referencePointSyncEpsilonMeters,
}: UseAnnotationCollectionDomainParams) => {
  const pointEntries = annotations.filter(
    (annotation): annotation is PointMeasurementEntry =>
      isPointAnnotationEntry(annotation)
  );

  const {
    annotationsByType,
    getAnnotationsForNavigation,
    getAnnotationIndexByType,
    getAnnotationOrderByType,
    getNextAnnotationOrderByType,
  } = useAnnotationsCollectionState(
    annotations,
    pointEntries,
    pointMeasureEntries,
    {
      nodeChainAnnotations,
    }
  );

  const { addAnnotation, updateAnnotationById } = useAnnotationEntryActions({
    setAnnotations,
  });

  const { flyToAnnotationById, flyToAllAnnotations } =
    useAnnotationFlyToActions({
      scene,
      annotations,
      nodeChainAnnotations,
    });

  const { setReferencePointId } = useReferencePointState({
    pointEntries,
    referencePoint,
    setReferencePoint,
    referencePointSyncEpsilonMeters,
  });

  return {
    annotationsByType,
    getAnnotationsForNavigation,
    getAnnotationIndexByType,
    getAnnotationOrderByType,
    getNextAnnotationOrderByType,
    addAnnotation,
    updateAnnotationById,
    flyToAnnotationById,
    flyToAllAnnotations,
    setReferencePointId,
  };
};
