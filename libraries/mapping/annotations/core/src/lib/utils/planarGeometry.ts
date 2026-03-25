import {
  Cartesian3,
  Cartesian4,
  Matrix4,
  Transforms,
  Ellipsoid,
  cartesian3FromJson,
  cartesian3ToJson,
  normalizeDirection,
} from "@carma/cesium";

import {
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
} from "../types/annotationTypes";
import type {
  NodeChainAnnotation,
  PlanarPolygonLocalFrame,
  PlanarPolygonPlane,
} from "../types/annotationTypes";

const EPSILON = 1e-8;

const getEllipsoidalUpAtPoint = (anchorECEF: Cartesian3): Cartesian3 => {
  const upMatrix = Transforms.eastNorthUpToFixedFrame(
    anchorECEF,
    Ellipsoid.WGS84
  );
  const up4 = Matrix4.getColumn(upMatrix, 2, new Cartesian4());

  return Cartesian3.normalize(
    new Cartesian3(up4.x, up4.y, up4.z),
    new Cartesian3()
  );
};

const normalizeBearingDeg = (bearingDeg: number): number =>
  ((bearingDeg % 360) + 360) % 360;

const computeBearingDegFromPlaneNormal = (
  plane: PlanarPolygonPlane
): number | undefined => {
  const normal = normalizeDirection(cartesian3FromJson(plane.normalECEF));
  if (!normal) return undefined;

  const anchor = cartesian3FromJson(plane.anchorECEF);
  const enuFrame = Transforms.eastNorthUpToFixedFrame(anchor, Ellipsoid.WGS84);
  const worldToEnu = Matrix4.inverse(enuFrame, new Matrix4());

  const normalEnu4 = Matrix4.multiplyByVector(
    worldToEnu,
    new Cartesian4(normal.x, normal.y, normal.z, 0),
    new Cartesian4()
  );
  const east = normalEnu4.x;
  const north = normalEnu4.y;
  const horizontalMagnitude = Math.hypot(east, north);
  if (horizontalMagnitude <= EPSILON) return undefined;

  const bearingDeg = (Math.atan2(east, north) * 180) / Math.PI;
  return normalizeBearingDeg(bearingDeg);
};

export const createPlaneFromThreePoints = (
  a: Cartesian3,
  b: Cartesian3,
  c: Cartesian3,
  preferredFacingPositionECEF?: Cartesian3 | null
): PlanarPolygonPlane | null => {
  const ab = Cartesian3.subtract(b, a, new Cartesian3());
  const ac = Cartesian3.subtract(c, a, new Cartesian3());
  const normal = Cartesian3.cross(ab, ac, new Cartesian3());
  if (Cartesian3.magnitudeSquared(normal) <= EPSILON) return null;

  const normalized = Cartesian3.normalize(normal, new Cartesian3());
  const plane: PlanarPolygonPlane = {
    anchorECEF: cartesian3ToJson(a),
    normalECEF: cartesian3ToJson(normalized),
  };
  return orientPlaneNormalTowardPosition(plane, preferredFacingPositionECEF);
};

export const orientPlaneNormalTowardPosition = (
  plane: PlanarPolygonPlane,
  referencePositionECEF?: Cartesian3 | null
): PlanarPolygonPlane => {
  if (!referencePositionECEF) return plane;

  const anchor = cartesian3FromJson(plane.anchorECEF);
  const normal = normalizeDirection(cartesian3FromJson(plane.normalECEF));
  if (!normal) return plane;

  const toReference = Cartesian3.subtract(
    referencePositionECEF,
    anchor,
    new Cartesian3()
  );
  if (Cartesian3.magnitudeSquared(toReference) <= EPSILON) return plane;
  if (Cartesian3.dot(normal, toReference) >= 0) return plane;

  const flippedNormal = Cartesian3.multiplyByScalar(
    normal,
    -1,
    new Cartesian3()
  );
  return {
    ...plane,
    normalECEF: cartesian3ToJson(flippedNormal),
  };
};

export const projectPointOntoPlane = (
  point: Cartesian3,
  plane: PlanarPolygonPlane
): Cartesian3 => {
  const anchor = cartesian3FromJson(plane.anchorECEF);
  const normal = Cartesian3.normalize(
    cartesian3FromJson(plane.normalECEF),
    new Cartesian3()
  );
  const delta = Cartesian3.subtract(point, anchor, new Cartesian3());
  const distanceAlongNormal = Cartesian3.dot(delta, normal);
  return Cartesian3.subtract(
    point,
    Cartesian3.multiplyByScalar(normal, distanceAlongNormal, new Cartesian3()),
    new Cartesian3()
  );
};

export const distancePointToPlane = (
  point: Cartesian3,
  plane: PlanarPolygonPlane
): number => {
  const anchor = cartesian3FromJson(plane.anchorECEF);
  const normal = Cartesian3.normalize(
    cartesian3FromJson(plane.normalECEF),
    new Cartesian3()
  );
  const delta = Cartesian3.subtract(point, anchor, new Cartesian3());
  return Math.abs(Cartesian3.dot(delta, normal));
};

export const computePolylinePlanarAngleSumDeg = (
  points: Cartesian3[],
  plane: PlanarPolygonPlane
): number => {
  if (points.length < 4) return Number.POSITIVE_INFINITY;
  const normal = Cartesian3.normalize(
    cartesian3FromJson(plane.normalECEF),
    new Cartesian3()
  );

  let sumDeg = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const prev = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    if (!prev || !current || !next) continue;

    const incoming = Cartesian3.subtract(current, prev, new Cartesian3());
    const outgoing = Cartesian3.subtract(next, current, new Cartesian3());

    const incomingOnPlane = Cartesian3.subtract(
      incoming,
      Cartesian3.multiplyByScalar(
        normal,
        Cartesian3.dot(incoming, normal),
        new Cartesian3()
      ),
      new Cartesian3()
    );
    const outgoingOnPlane = Cartesian3.subtract(
      outgoing,
      Cartesian3.multiplyByScalar(
        normal,
        Cartesian3.dot(outgoing, normal),
        new Cartesian3()
      ),
      new Cartesian3()
    );

    if (
      Cartesian3.magnitudeSquared(incomingOnPlane) <= EPSILON ||
      Cartesian3.magnitudeSquared(outgoingOnPlane) <= EPSILON
    ) {
      continue;
    }

    const inNorm = Cartesian3.normalize(incomingOnPlane, new Cartesian3());
    const outNorm = Cartesian3.normalize(outgoingOnPlane, new Cartesian3());
    const dot = Math.max(-1, Math.min(1, Cartesian3.dot(inNorm, outNorm)));
    const angleDeg = (Math.acos(dot) * 180) / Math.PI;
    if (Number.isFinite(angleDeg)) {
      sumDeg += angleDeg;
    }
  }
  return sumDeg;
};

const getPlaneBasisU = (
  vertices: Cartesian3[],
  anchor: Cartesian3,
  normal: Cartesian3
): Cartesian3 => {
  for (let index = 0; index < vertices.length - 1; index += 1) {
    const current = vertices[index];
    const next = vertices[index + 1];
    if (!current || !next) continue;

    const edge = Cartesian3.subtract(next, current, new Cartesian3());
    const edgeOnPlane = Cartesian3.subtract(
      edge,
      Cartesian3.multiplyByScalar(
        normal,
        Cartesian3.dot(edge, normal),
        new Cartesian3()
      ),
      new Cartesian3()
    );
    if (Cartesian3.magnitudeSquared(edgeOnPlane) > EPSILON) {
      return Cartesian3.normalize(edgeOnPlane, new Cartesian3());
    }
  }

  const upMatrix = Transforms.eastNorthUpToFixedFrame(anchor, Ellipsoid.WGS84);
  const east4 = Matrix4.getColumn(upMatrix, 0, new Cartesian4());
  const east = Cartesian3.normalize(
    new Cartesian3(east4.x, east4.y, east4.z),
    new Cartesian3()
  );
  const eastOnPlane = Cartesian3.subtract(
    east,
    Cartesian3.multiplyByScalar(
      normal,
      Cartesian3.dot(east, normal),
      new Cartesian3()
    ),
    new Cartesian3()
  );
  if (Cartesian3.magnitudeSquared(eastOnPlane) > EPSILON) {
    return Cartesian3.normalize(eastOnPlane, new Cartesian3());
  }

  return Cartesian3.normalize(
    Cartesian3.cross(normal, Cartesian3.UNIT_X, new Cartesian3()),
    new Cartesian3()
  );
};

export const computePlanarPolygonArea = (
  vertices: Cartesian3[],
  plane: PlanarPolygonPlane
): number => {
  if (vertices.length < 3) return 0;
  const anchor = cartesian3FromJson(plane.anchorECEF);
  const normal = Cartesian3.normalize(
    cartesian3FromJson(plane.normalECEF),
    new Cartesian3()
  );
  const u = getPlaneBasisU(vertices, anchor, normal);
  const v = Cartesian3.normalize(
    Cartesian3.cross(normal, u, new Cartesian3()),
    new Cartesian3()
  );

  const coords = vertices.map((vertex) => {
    const delta = Cartesian3.subtract(vertex, anchor, new Cartesian3());
    return {
      x: Cartesian3.dot(delta, u),
      y: Cartesian3.dot(delta, v),
    };
  });

  let shoelace = 0;
  for (let index = 0; index < coords.length; index += 1) {
    const current = coords[index];
    const next = coords[(index + 1) % coords.length];
    if (!current || !next) continue;
    shoelace += current.x * next.y - current.y * next.x;
  }
  return Math.abs(shoelace) * 0.5;
};

export const computeVerticalityDeg = (plane: PlanarPolygonPlane): number => {
  const anchor = cartesian3FromJson(plane.anchorECEF);
  const normal = Cartesian3.normalize(
    cartesian3FromJson(plane.normalECEF),
    new Cartesian3()
  );
  const up = getEllipsoidalUpAtPoint(anchor);
  const dot = Math.max(-1, Math.min(1, Math.abs(Cartesian3.dot(normal, up))));
  return (Math.acos(dot) * 180) / Math.PI;
};

export const classifyPlanarPolygonType = (
  verticalityDeg: number
): typeof ANNOTATION_TYPE_AREA_PLANAR | typeof ANNOTATION_TYPE_AREA_VERTICAL =>
  verticalityDeg > 85
    ? ANNOTATION_TYPE_AREA_VERTICAL
    : ANNOTATION_TYPE_AREA_PLANAR;

export const buildEdgeRelationIdsForPolygon = (
  nodeIds: string[],
  closed: boolean,
  getDistanceRelationId: (left: string, right: string) => string
): string[] => {
  if (nodeIds.length < 2) return [];
  const edgeIds: string[] = [];
  for (let index = 0; index < nodeIds.length - 1; index += 1) {
    const start = nodeIds[index];
    const end = nodeIds[index + 1];
    if (!start || !end) continue;
    edgeIds.push(getDistanceRelationId(start, end));
  }
  if (closed && nodeIds.length >= 3) {
    const first = nodeIds[0];
    const last = nodeIds[nodeIds.length - 1];
    if (first && last) {
      edgeIds.push(getDistanceRelationId(last, first));
    }
  }
  return edgeIds;
};

const derivePlaneFromVertices = (
  vertices: Cartesian3[],
  preferredFacingPositionECEF?: Cartesian3 | null
): PlanarPolygonPlane | null => {
  if (vertices.length < 3) return null;

  for (let i = 0; i < vertices.length - 2; i += 1) {
    for (let j = i + 1; j < vertices.length - 1; j += 1) {
      for (let k = j + 1; k < vertices.length; k += 1) {
        const a = vertices[i];
        const b = vertices[j];
        const c = vertices[k];
        if (!a || !b || !c) continue;
        const plane = createPlaneFromThreePoints(
          a,
          b,
          c,
          preferredFacingPositionECEF
        );
        if (plane) return plane;
      }
    }
  }

  return null;
};

const deriveVerticalPolygonLocalFrame = (
  vertices: Cartesian3[],
  plane: PlanarPolygonPlane,
  previousFrame?: PlanarPolygonLocalFrame
): PlanarPolygonLocalFrame | undefined => {
  if (vertices.length === 0) return undefined;

  const origin = vertices[0] ?? cartesian3FromJson(plane.anchorECEF);
  let north = normalizeDirection(cartesian3FromJson(plane.normalECEF));
  if (!north) return undefined;

  if (previousFrame) {
    const previousNorth = normalizeDirection(
      cartesian3FromJson(previousFrame.northECEF)
    );
    if (previousNorth && Cartesian3.dot(north, previousNorth) < 0) {
      north = Cartesian3.multiplyByScalar(north, -1, new Cartesian3());
    }
  }

  const ellipsoidalUp = getEllipsoidalUpAtPoint(origin);
  let upInPlane = ellipsoidalUp
    ? normalizeDirection(
        Cartesian3.subtract(
          ellipsoidalUp,
          Cartesian3.multiplyByScalar(
            north,
            Cartesian3.dot(ellipsoidalUp, north),
            new Cartesian3()
          ),
          new Cartesian3()
        )
      )
    : null;

  let east = upInPlane
    ? normalizeDirection(Cartesian3.cross(north, upInPlane, new Cartesian3()))
    : null;

  if (!east) {
    for (let index = 0; index < vertices.length - 1; index += 1) {
      const start = vertices[index];
      const end = vertices[index + 1];
      if (!start || !end) continue;
      const edge = Cartesian3.subtract(end, start, new Cartesian3());
      const inPlaneEdge = Cartesian3.subtract(
        edge,
        Cartesian3.multiplyByScalar(
          north,
          Cartesian3.dot(edge, north),
          new Cartesian3()
        ),
        new Cartesian3()
      );
      east = normalizeDirection(inPlaneEdge);
      if (east) break;
    }
  }

  if (!east) {
    east = normalizeDirection(
      Cartesian3.cross(north, Cartesian3.UNIT_X, new Cartesian3())
    );
  }
  if (!east) {
    east = normalizeDirection(
      Cartesian3.cross(north, Cartesian3.UNIT_Y, new Cartesian3())
    );
  }
  if (!east) {
    return undefined;
  }

  upInPlane = normalizeDirection(
    Cartesian3.cross(east, north, new Cartesian3())
  );
  if (!upInPlane) return undefined;

  if (previousFrame) {
    const previousEast = normalizeDirection(
      cartesian3FromJson(previousFrame.eastECEF)
    );
    if (previousEast && Cartesian3.dot(east, previousEast) < 0) {
      east = Cartesian3.multiplyByScalar(east, -1, new Cartesian3());
      north = Cartesian3.multiplyByScalar(north, -1, new Cartesian3());
    }
  }

  return {
    originECEF: cartesian3ToJson(origin),
    eastECEF: cartesian3ToJson(east),
    northECEF: cartesian3ToJson(north),
    upECEF: cartesian3ToJson(upInPlane),
  };
};

export const computePolygonGroupDerivedData = (
  group: NodeChainAnnotation,
  pointById: Map<string, Cartesian3>,
  options?: {
    preferredFacingPositionECEF?: Cartesian3 | null;
  }
): NodeChainAnnotation => {
  const preferredFacingPositionECEF =
    options?.preferredFacingPositionECEF ?? null;
  const computePerimeterMeters = () => {
    if (vertices.length < 2) return 0;
    let perimeterMeters = 0;
    for (let index = 1; index < vertices.length; index += 1) {
      const start = vertices[index - 1];
      const end = vertices[index];
      if (!start || !end) continue;
      perimeterMeters += Cartesian3.distance(start, end);
    }
    if (group.closed && vertices.length >= 3) {
      const first = vertices[0];
      const last = vertices[vertices.length - 1];
      if (first && last) {
        perimeterMeters += Cartesian3.distance(last, first);
      }
    }
    return perimeterMeters;
  };

  const vertices = group.nodeIds
    .map((id) => pointById.get(id))
    .filter((value): value is Cartesian3 => Boolean(value));
  const perimeterMeters = computePerimeterMeters();
  if (vertices.length < 3) {
    return {
      ...group,
      perimeterMeters,
      areaSquareMeters: 0,
      verticalityDeg: group.verticalityDeg ?? 0,
    };
  }

  // Keep existing plane if present, otherwise derive one from non-collinear vertices.
  const plane =
    group.plane ??
    derivePlaneFromVertices(vertices, preferredFacingPositionECEF);
  if (!plane) {
    return {
      ...group,
      perimeterMeters,
      areaSquareMeters: 0,
      verticalityDeg: group.verticalityDeg ?? 0,
    };
  }

  // Area is meaningful for closed polygons and for preliminary plane-locked polygons.
  const canComputeArea = group.closed || group.planeLocked;
  const areaSquareMeters = canComputeArea
    ? computePlanarPolygonArea(vertices, plane)
    : 0;
  const verticalityDeg = computeVerticalityDeg(plane);
  const bearingDeg = computeBearingDegFromPlaneNormal(plane);
  const planarPolygonLocalFrame =
    group.type === ANNOTATION_TYPE_AREA_VERTICAL
      ? deriveVerticalPolygonLocalFrame(
          vertices,
          plane,
          group.planarPolygonLocalFrame
        )
      : undefined;

  return {
    ...group,
    plane,
    planarPolygonLocalFrame,
    perimeterMeters,
    areaSquareMeters,
    verticalityDeg,
    bearingDeg,
  };
};
