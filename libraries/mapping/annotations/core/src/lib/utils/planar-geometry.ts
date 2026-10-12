import {
  createPlaneBasisFromNormal,
  getPolygonArea2d,
  normalizeDirection,
  projectVector3OntoPlane,
} from "@carma-commons/math";
import {
  getEllipsoidalUpDirectionAtAnchor,
  readEnuAxesAtEcef,
  vector3FromMetricVector3,
} from "@carma-geo/proj";
import { PI, radToDegNumeric, type Radians, zeroToTwoPi } from "@carma-units";
import { Vector3 } from "three";

import {
  ANNOTATION_TYPES,
  type DerivedNodeChainAnnotation,
  type DerivedNodeChainAnnotationGeometry,
  type NodeChainAnnotation,
  type PlanarPolygonPlane,
} from "../types/annotation-types";
import { createPlaneFromFirstNonCollinearPoints } from "./plane-fitting";
import { deriveVerticalPolygonLocalFrame } from "./vertical-polygon-local-frame";

const BEARING_HORIZONTAL_MAGNITUDE_EPSILON = 1e-8;

/** Compass bearing (0..2pi, clockwise from north) of the plane normal; undefined for a horizontal plane. */
const computeBearingRadFromPlaneNormal = (
  plane: PlanarPolygonPlane
): number | undefined => {
  const normal = normalizeDirection(vector3FromMetricVector3(plane.normalECEF));
  if (!normal) return undefined;

  const { east, north } = readEnuAxesAtEcef(
    vector3FromMetricVector3(plane.anchorECEF)
  );
  const eastComponent = normal.dot(east);
  const northComponent = normal.dot(north);
  if (
    Math.hypot(eastComponent, northComponent) <=
    BEARING_HORIZONTAL_MAGNITUDE_EPSILON
  ) {
    return undefined;
  }

  return zeroToTwoPi(Math.atan2(eastComponent, northComponent) as Radians);
};

export const projectPointOntoPlane = (
  point: Vector3,
  plane: PlanarPolygonPlane
): Vector3 =>
  projectVector3OntoPlane(
    point,
    vector3FromMetricVector3(plane.anchorECEF),
    vector3FromMetricVector3(plane.normalECEF)
  );

/** Area of the vertices projected into the plane. */
export const computePlanarPolygonArea = (
  vertices: readonly Vector3[],
  plane: PlanarPolygonPlane
): number => {
  if (vertices.length < 3) return 0;
  const anchor = vector3FromMetricVector3(plane.anchorECEF);
  const { xAxis, yAxis } = createPlaneBasisFromNormal(
    vector3FromMetricVector3(plane.normalECEF).normalize()
  );

  return getPolygonArea2d(
    vertices.map((vertex) => {
      const delta = new Vector3().subVectors(vertex, anchor);
      return { x: delta.dot(xAxis), y: delta.dot(yAxis) };
    })
  );
};

/** Angle between the plane normal and the ellipsoidal up, folded into 0..90 degrees. */
const computeVerticalityDeg = (plane: PlanarPolygonPlane): number => {
  const normal = vector3FromMetricVector3(plane.normalECEF).normalize();
  const up = getEllipsoidalUpDirectionAtAnchor(
    vector3FromMetricVector3(plane.anchorECEF)
  );
  const angle = normal.angleTo(up);
  return radToDegNumeric(Math.min(angle, PI - angle) as Radians)!;
};

const computePerimeterMeters = (
  vertices: readonly Vector3[],
  closed: boolean
): number => {
  let perimeterMeters = 0;
  for (let index = 1; index < vertices.length; index += 1) {
    const start = vertices[index - 1];
    const end = vertices[index];
    if (start && end) perimeterMeters += start.distanceTo(end);
  }
  const first = vertices[0];
  const last = vertices[vertices.length - 1];
  if (closed && vertices.length >= 3 && first && last) {
    perimeterMeters += last.distanceTo(first);
  }
  return perimeterMeters;
};

export const computePolygonGroupDerivedData = (
  group: NodeChainAnnotation,
  pointById: Map<string, Vector3>,
  options?: {
    preferredFacingPositionECEF?: Vector3 | null;
    previousDerivedGeometry?: DerivedNodeChainAnnotationGeometry | null;
  }
): DerivedNodeChainAnnotation => {
  const vertices = group.nodeIds
    .map((id) => pointById.get(id))
    .filter((value): value is Vector3 => Boolean(value));
  const perimeterMeters = computePerimeterMeters(vertices, group.closed);
  const plane =
    vertices.length < 3
      ? null
      : createPlaneFromFirstNonCollinearPoints(
          vertices,
          options?.preferredFacingPositionECEF ?? null
        );
  if (!plane) {
    return { ...group, perimeterMeters, areaSquareMeters: 0 };
  }

  // Area is meaningful for closed polygons and for preliminary plane-locked polygons.
  const areaSquareMeters =
    group.closed || group.planeLocked
      ? computePlanarPolygonArea(vertices, plane)
      : 0;

  return {
    ...group,
    plane,
    planarPolygonLocalFrame:
      group.type === ANNOTATION_TYPES.AREA_VERTICAL
        ? deriveVerticalPolygonLocalFrame(
            vertices,
            plane,
            options?.previousDerivedGeometry?.planarPolygonLocalFrame
          )
        : undefined,
    perimeterMeters,
    areaSquareMeters,
    verticalityDeg: computeVerticalityDeg(plane),
    bearingRad: computeBearingRadFromPlaneNormal(plane),
  };
};
