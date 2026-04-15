import type {
  RuntimeCoordinate,
  RuntimeMeasurement,
  RuntimeNode,
} from "../store";

export const buildRuntimeNodeCoordinateMap = (
  nodes: readonly RuntimeNode[]
): ReadonlyMap<string, RuntimeCoordinate> =>
  new Map(nodes.map((node) => [node.id, node.coordinate]));

export const resolveMeasurementCoordinates = (
  measurement: RuntimeMeasurement,
  nodeCoordinatesById: ReadonlyMap<string, RuntimeCoordinate>
): readonly RuntimeCoordinate[] =>
  measurement.nodeIds
    .map((nodeId) => nodeCoordinatesById.get(nodeId))
    .filter((coordinate): coordinate is RuntimeCoordinate =>
      Boolean(coordinate)
    );
