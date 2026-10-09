import { ecefFromGeographicCoordinate } from "@carma-mapping/annotations/core";

import {
  buildRuntimeNodeCoordinateMap,
  resolveMeasurementCoordinates,
} from "../render/resolve-measurement-coordinates";
import { findAnnotationEntryById } from "../store";
import type {
  StoredAnnotation,
  AnnotationGeographicCoordinate,
  AnnotationNode,
} from "../store";

export const resolveAnnotationEntryCoordinates = ({
  annotationEntries,
  nodes,
  annotationId,
}: {
  annotationEntries: readonly StoredAnnotation[];
  nodes: readonly AnnotationNode[];
  annotationId: string | null;
}): readonly AnnotationGeographicCoordinate[] => {
  if (!annotationId) {
    return [];
  }

  const annotationEntry = findAnnotationEntryById(
    annotationEntries,
    annotationId
  );
  if (!annotationEntry) {
    return [];
  }

  return resolveMeasurementCoordinates(
    annotationEntry,
    buildRuntimeNodeCoordinateMap(nodes)
  );
};

export const resolveAnnotationEntryEcefPoints = ({
  annotationEntries,
  nodes,
  annotationId,
}: {
  annotationEntries: readonly StoredAnnotation[];
  nodes: readonly AnnotationNode[];
  annotationId: string | null;
}) =>
  resolveAnnotationEntryCoordinates({
    annotationEntries,
    nodes,
    annotationId,
  }).flatMap((coordinate) =>
    coordinate ? [ecefFromGeographicCoordinate(coordinate)] : []
  );
