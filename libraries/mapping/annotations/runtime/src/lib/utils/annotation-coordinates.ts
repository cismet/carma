import { cartesian3FromGeographicCoordinate } from "@carma-mapping/engines/cesium/core";

import {
  buildRuntimeNodeCoordinateMap,
  resolveMeasurementCoordinates,
} from "../render/resolve-measurement-coordinates";
import { findAnnotationEntryById } from "../store";
import type {
  StoredAnnotation,
  CesiumGeographicCoordinate,
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
}): readonly CesiumGeographicCoordinate[] => {
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

export const resolveAnnotationEntryCartesianPoints = ({
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
    coordinate ? [cartesian3FromGeographicCoordinate(coordinate)] : []
  );
