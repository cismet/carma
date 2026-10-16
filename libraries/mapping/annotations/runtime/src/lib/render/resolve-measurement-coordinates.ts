import type {
  AnnotationGeographicCoordinate,
  StoredAnnotation,
  AnnotationNode,
} from "../store";

export const buildRuntimeNodeCoordinateMap = (
  nodes: readonly AnnotationNode[]
): ReadonlyMap<string, AnnotationGeographicCoordinate> =>
  new Map(nodes.map((node) => [node.id, node.coordinate]));

export const resolveMeasurementCoordinates = (
  measurement: StoredAnnotation,
  nodeCoordinatesById: ReadonlyMap<string, AnnotationGeographicCoordinate>
): readonly AnnotationGeographicCoordinate[] =>
  measurement.nodeIds
    .map((nodeId) => nodeCoordinatesById.get(nodeId))
    .filter((coordinate): coordinate is AnnotationGeographicCoordinate =>
      Boolean(coordinate)
    );
