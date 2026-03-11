import { useCallback } from "react";

import { type Scene } from "@carma/cesium";
import {
  getAnnotationFlyToPointsById,
  getMeasurementEntryFlyToPoints,
  type AnnotationCollection,
  type NodeChainAnnotation,
} from "@carma-mapping/annotations/core";
import { flyToMeasurementPoints } from "@carma-mapping/annotations/cesium";

type UseAnnotationFlyToActionsParams = {
  scene: Scene;
  annotations: AnnotationCollection;
  nodeChainAnnotations: NodeChainAnnotation[];
};

export const useAnnotationFlyToActions = ({
  scene,
  annotations,
  nodeChainAnnotations,
}: UseAnnotationFlyToActionsParams) => {
  const flyToAnnotationById = useCallback(
    (id: string) => {
      if (!id) return;
      const flyToPoints = getAnnotationFlyToPointsById(
        id,
        annotations,
        nodeChainAnnotations
      );
      if (flyToPoints.length === 0) return;
      flyToMeasurementPoints(scene, flyToPoints);
    },
    [annotations, nodeChainAnnotations, scene]
  );

  const flyToAllAnnotations = useCallback(() => {
    if (annotations.length === 0) return;
    const points = annotations.flatMap(getMeasurementEntryFlyToPoints);
    flyToMeasurementPoints(scene, points);
  }, [annotations, scene]);

  return {
    flyToAnnotationById,
    flyToAllAnnotations,
  };
};
