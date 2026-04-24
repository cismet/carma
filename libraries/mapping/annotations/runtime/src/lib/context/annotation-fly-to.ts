import { BoundingSphere, type Cartesian3 } from "@carma-cesium";
import { flyToBoundingSphereExtent } from "@carma-mapping/engines/cesium/core";

import type { Scene } from "@carma-cesium";
import type { AnnotationNode, StoredAnnotation } from "../store";
import { resolveAnnotationEntryCartesianPoints } from "../utils/annotation-coordinates";
import { ANNOTATIONS_HOST_DEFAULTS } from "./annotations-host-defaults";

export const flyToAnnotationPoints = ({
  scene,
  points,
}: {
  scene: Scene | null;
  points: readonly Cartesian3[];
}) => {
  if (!scene || scene.isDestroyed() || points.length === 0) {
    return;
  }

  const sphere = BoundingSphere.fromPoints([...points]);
  sphere.radius = Math.max(
    sphere.radius,
    ANNOTATIONS_HOST_DEFAULTS.infoBoxFlyTo.minRadiusMeters
  );
  flyToBoundingSphereExtent(scene.camera, sphere, {
    minRange: ANNOTATIONS_HOST_DEFAULTS.infoBoxFlyTo.minRadiusMeters,
    paddingFactor: ANNOTATIONS_HOST_DEFAULTS.infoBoxFlyTo.paddingFactor,
  });
};

export const resolveAnnotationIdsCartesianPoints = ({
  annotationEntries,
  annotationIds,
  nodes,
}: {
  annotationEntries: readonly StoredAnnotation[];
  annotationIds: readonly string[];
  nodes: readonly AnnotationNode[];
}): readonly Cartesian3[] => {
  const annotationIdSet = new Set(annotationIds);

  return annotationEntries
    .filter((annotationEntry) => annotationIdSet.has(annotationEntry.id))
    .flatMap((annotationEntry) =>
      resolveAnnotationEntryCartesianPoints({
        annotationEntries,
        annotationId: annotationEntry.id,
        nodes,
      })
    );
};

export const flyToAnnotationIds = ({
  annotationEntries,
  annotationIds,
  nodes,
  scene,
}: {
  annotationEntries: readonly StoredAnnotation[];
  annotationIds: readonly string[];
  nodes: readonly AnnotationNode[];
  scene: Scene | null;
}) => {
  flyToAnnotationPoints({
    scene,
    points: resolveAnnotationIdsCartesianPoints({
      annotationEntries,
      annotationIds,
      nodes,
    }),
  });
};
