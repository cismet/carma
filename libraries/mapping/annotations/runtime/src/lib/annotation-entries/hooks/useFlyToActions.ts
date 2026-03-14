import { useCallback } from "react";

import {
  BoundingSphere,
  flyToBoundingSphereExtent,
  type Cartesian3,
  type Scene,
} from "@carma/cesium";
import {
  getAnnotationFlyToPointsById,
  getMeasurementEntryFlyToPoints,
  type AnnotationCollection,
  type NodeChainAnnotation,
} from "@carma-mapping/annotations/core";

const FLY_TO_MIN_RADIUS_METERS = 50;
const FLY_TO_PADDING_FACTOR = 1.1;

const flyToPoints = (
  scene: Scene | null | undefined,
  points: readonly Cartesian3[]
) => {
  if (!scene || scene.isDestroyed() || points.length === 0) {
    return;
  }

  const sphere = BoundingSphere.fromPoints([...points]);
  sphere.radius = Math.max(sphere.radius, FLY_TO_MIN_RADIUS_METERS);
  flyToBoundingSphereExtent(scene.camera, sphere, {
    minRange: FLY_TO_MIN_RADIUS_METERS,
    paddingFactor: FLY_TO_PADDING_FACTOR,
  });
};

type UseAnnotationFlyToActionsParams = {
  scene: Scene;
  annotations: AnnotationCollection;
  nodeChainAnnotations: NodeChainAnnotation[];
};

export const useFlyToActions = ({
  scene,
  annotations,
  nodeChainAnnotations,
}: UseAnnotationFlyToActionsParams) => {
  const flyToAnnotationById = useCallback(
    (id: string) => {
      if (!id) return;
      const annotationFlyToPoints = getAnnotationFlyToPointsById(
        id,
        annotations,
        nodeChainAnnotations
      );
      if (annotationFlyToPoints.length === 0) return;
      flyToPoints(scene, annotationFlyToPoints);
    },
    [annotations, nodeChainAnnotations, scene]
  );

  const flyToAllAnnotations = useCallback(() => {
    if (annotations.length === 0) return;
    const points = annotations.flatMap(getMeasurementEntryFlyToPoints);
    flyToPoints(scene, points);
  }, [annotations, scene]);

  return {
    flyToAnnotationById,
    flyToAllAnnotations,
  };
};
