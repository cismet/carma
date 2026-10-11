import type { Vector3 } from "three";

import { isValidAnnotationEngine, type AnnotationEngine } from "../engine";
import type { AnnotationNode, StoredAnnotation } from "../store";
import { resolveAnnotationEntryEcefPoints } from "../utils/annotation-coordinates";
import { ANNOTATIONS_HOST_DEFAULTS } from "./annotations-host-defaults";

export const flyToAnnotationPoints = ({
  engine,
  points,
}: {
  engine: AnnotationEngine | null;
  points: readonly Vector3[];
}) => {
  if (!isValidAnnotationEngine(engine) || points.length === 0) {
    return;
  }

  engine.flyToPoints(points, {
    minRadiusMeters: ANNOTATIONS_HOST_DEFAULTS.infoBoxFlyTo.minRadiusMeters,
    paddingFactor: ANNOTATIONS_HOST_DEFAULTS.infoBoxFlyTo.paddingFactor,
  });
};

export const resolveAnnotationIdsEcefPoints = ({
  annotationEntries,
  annotationIds,
  nodes,
}: {
  annotationEntries: readonly StoredAnnotation[];
  annotationIds: readonly string[];
  nodes: readonly AnnotationNode[];
}): readonly Vector3[] => {
  const annotationIdSet = new Set(annotationIds);

  return annotationEntries
    .filter((annotationEntry) => annotationIdSet.has(annotationEntry.id))
    .flatMap((annotationEntry) =>
      resolveAnnotationEntryEcefPoints({
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
  engine,
}: {
  annotationEntries: readonly StoredAnnotation[];
  annotationIds: readonly string[];
  nodes: readonly AnnotationNode[];
  engine: AnnotationEngine | null;
}) => {
  flyToAnnotationPoints({
    engine,
    points: resolveAnnotationIdsEcefPoints({
      annotationEntries,
      annotationIds,
      nodes,
    }),
  });
};
