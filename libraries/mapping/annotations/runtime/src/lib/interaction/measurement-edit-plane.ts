import {
  ecefFromGeographicCoordinate,
  geographicCoordinateFromEcef,
} from "@carma-geo/proj";
import {
  computePolygonGroupDerivedData,
  projectPointOntoPlane,
  type AnnotationGeographicCoordinate,
  type NodeChainAnnotation,
  type PlanarPolygonPlane,
} from "@carma-mapping/annotations/core";

import type { AnnotationNode, StoredAnnotation } from "../store";

/** A snapped node off the measurement's own plane by more than this stays unsnapped. */
const MEASUREMENT_PLANE_SNAP_TOLERANCE_METERS = 0.05;

/** The plane of a roof or a wall, from its committed nodes. */
export const resolveMeasurementEditPlane = (
  measurement: StoredAnnotation,
  nodes: readonly AnnotationNode[]
): PlanarPolygonPlane | null => {
  const pointById = new Map(
    nodes.map(
      (node) =>
        [node.id, ecefFromGeographicCoordinate(node.coordinate)] as const
    )
  );
  const derived = computePolygonGroupDerivedData(
    {
      id: measurement.id,
      type: measurement.toolType as NodeChainAnnotation["type"],
      nodeIds: [...measurement.nodeIds],
      edgeRelationIds: [],
      closed: measurement.closed ?? true,
      planeLocked: true,
    } satisfies NodeChainAnnotation,
    pointById
  );
  return derived.plane ?? null;
};

export const projectCoordinateOntoPlane = (
  coordinate: AnnotationGeographicCoordinate,
  plane: PlanarPolygonPlane
): AnnotationGeographicCoordinate =>
  geographicCoordinateFromEcef(
    projectPointOntoPlane(ecefFromGeographicCoordinate(coordinate), plane)
  );

export const isCoordinateOffPlane = (
  coordinate: AnnotationGeographicCoordinate,
  plane: PlanarPolygonPlane
): boolean => {
  const position = ecefFromGeographicCoordinate(coordinate);
  return (
    position.distanceTo(projectPointOntoPlane(position, plane)) >
    MEASUREMENT_PLANE_SNAP_TOLERANCE_METERS
  );
};
