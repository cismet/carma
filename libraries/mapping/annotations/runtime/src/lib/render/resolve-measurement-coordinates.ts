import type {
  CesiumGeographicCoordinate,
  StoredAnnotation,
  AnnotationNode,
} from "../store";

export const buildRuntimeNodeCoordinateMap = (
  nodes: readonly AnnotationNode[]
): ReadonlyMap<string, CesiumGeographicCoordinate> =>
  new Map(nodes.map((node) => [node.id, node.coordinate]));

export const resolveMeasurementCoordinates = (
  measurement: StoredAnnotation,
  nodeCoordinatesById: ReadonlyMap<string, CesiumGeographicCoordinate>
): readonly CesiumGeographicCoordinate[] =>
  measurement.nodeIds
    .map((nodeId) => nodeCoordinatesById.get(nodeId))
    .filter((coordinate): coordinate is CesiumGeographicCoordinate =>
      Boolean(coordinate)
    );
