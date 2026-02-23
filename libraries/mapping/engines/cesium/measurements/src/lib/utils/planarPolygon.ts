import {
  Cartesian3,
  Cartesian4,
  Matrix4,
  Transforms,
  Ellipsoid,
} from "@carma/cesium";

import type {
  PlanarPolygonGroup,
  PlanarPolygonLocalFrame,
  PlanarPolygonPlane,
  SurfaceType,
} from "../types/MeasurementTypes";

const EPSILON = 1e-8;

export const toSerializableCartesian3 = (value: Cartesian3) => ({
  x: value.x,
  y: value.y,
  z: value.z,
});

export const fromSerializableCartesian3 = (value: {
  x: number;
  y: number;
  z: number;
}) => new Cartesian3(value.x, value.y, value.z);

const normalizeDirection = (direction: Cartesian3): Cartesian3 | null => {
  if (Cartesian3.magnitudeSquared(direction) <= EPSILON) {
    return null;
  }
  return Cartesian3.normalize(direction, new Cartesian3());
};

export const createPlaneFromThreePoints = (
  a: Cartesian3,
  b: Cartesian3,
  c: Cartesian3
): PlanarPolygonPlane | null => {
  const ab = Cartesian3.subtract(b, a, new Cartesian3());
  const ac = Cartesian3.subtract(c, a, new Cartesian3());
  const normal = Cartesian3.cross(ab, ac, new Cartesian3());
  if (Cartesian3.magnitudeSquared(normal) <= EPSILON) return null;

  const normalized = Cartesian3.normalize(normal, new Cartesian3());
  return {
    anchorECEF: toSerializableCartesian3(a),
    normalECEF: toSerializableCartesian3(normalized),
  };
};

export const projectPointOntoPlane = (
  point: Cartesian3,
  plane: PlanarPolygonPlane
): Cartesian3 => {
  const anchor = fromSerializableCartesian3(plane.anchorECEF);
  const normal = Cartesian3.normalize(
    fromSerializableCartesian3(plane.normalECEF),
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
  const anchor = fromSerializableCartesian3(plane.anchorECEF);
  const normal = Cartesian3.normalize(
    fromSerializableCartesian3(plane.normalECEF),
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
    fromSerializableCartesian3(plane.normalECEF),
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
  const anchor = fromSerializableCartesian3(plane.anchorECEF);
  const normal = Cartesian3.normalize(
    fromSerializableCartesian3(plane.normalECEF),
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
  const anchor = fromSerializableCartesian3(plane.anchorECEF);
  const normal = Cartesian3.normalize(
    fromSerializableCartesian3(plane.normalECEF),
    new Cartesian3()
  );
  const upMatrix = Transforms.eastNorthUpToFixedFrame(anchor, Ellipsoid.WGS84);
  const up4 = Matrix4.getColumn(upMatrix, 2, new Cartesian4());
  const up = Cartesian3.normalize(
    new Cartesian3(up4.x, up4.y, up4.z),
    new Cartesian3()
  );
  const dot = Math.max(-1, Math.min(1, Math.abs(Cartesian3.dot(normal, up))));
  return (Math.acos(dot) * 180) / Math.PI;
};

export const classifySurfaceType = (verticalityDeg: number): SurfaceType =>
  verticalityDeg > 85 ? "facade" : "roof";

export const buildEdgeRelationIdsForPolygon = (
  vertexPointIds: string[],
  closed: boolean,
  getDistanceRelationId: (left: string, right: string) => string
): string[] => {
  if (vertexPointIds.length < 2) return [];
  const edgeIds: string[] = [];
  for (let index = 0; index < vertexPointIds.length - 1; index += 1) {
    const start = vertexPointIds[index];
    const end = vertexPointIds[index + 1];
    if (!start || !end) continue;
    edgeIds.push(getDistanceRelationId(start, end));
  }
  if (closed && vertexPointIds.length >= 3) {
    const first = vertexPointIds[0];
    const last = vertexPointIds[vertexPointIds.length - 1];
    if (first && last) {
      edgeIds.push(getDistanceRelationId(last, first));
    }
  }
  return edgeIds;
};

const derivePlaneFromVertices = (
  vertices: Cartesian3[]
): PlanarPolygonPlane | null => {
  if (vertices.length < 3) return null;

  for (let i = 0; i < vertices.length - 2; i += 1) {
    for (let j = i + 1; j < vertices.length - 1; j += 1) {
      for (let k = j + 1; k < vertices.length; k += 1) {
        const a = vertices[i];
        const b = vertices[j];
        const c = vertices[k];
        if (!a || !b || !c) continue;
        const plane = createPlaneFromThreePoints(a, b, c);
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

  const origin = vertices[0] ?? fromSerializableCartesian3(plane.anchorECEF);
  let north = normalizeDirection(fromSerializableCartesian3(plane.normalECEF));
  if (!north) return undefined;

  if (previousFrame) {
    const previousNorth = normalizeDirection(
      fromSerializableCartesian3(previousFrame.northECEF)
    );
    if (previousNorth && Cartesian3.dot(north, previousNorth) < 0) {
      north = Cartesian3.multiplyByScalar(north, -1, new Cartesian3());
    }
  }

  const geocentricUp = normalizeDirection(origin);
  let upInPlane = geocentricUp
    ? normalizeDirection(
        Cartesian3.subtract(
          geocentricUp,
          Cartesian3.multiplyByScalar(
            north,
            Cartesian3.dot(geocentricUp, north),
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
    east = normalizeDirection(Cartesian3.cross(north, Cartesian3.UNIT_X, new Cartesian3()));
  }
  if (!east) {
    east = normalizeDirection(Cartesian3.cross(north, Cartesian3.UNIT_Y, new Cartesian3()));
  }
  if (!east) {
    return undefined;
  }

  upInPlane = normalizeDirection(Cartesian3.cross(east, north, new Cartesian3()));
  if (!upInPlane) return undefined;

  if (previousFrame) {
    const previousEast = normalizeDirection(
      fromSerializableCartesian3(previousFrame.eastECEF)
    );
    if (previousEast && Cartesian3.dot(east, previousEast) < 0) {
      east = Cartesian3.multiplyByScalar(east, -1, new Cartesian3());
      north = Cartesian3.multiplyByScalar(north, -1, new Cartesian3());
    }
  }

  return {
    originECEF: toSerializableCartesian3(origin),
    eastECEF: toSerializableCartesian3(east),
    northECEF: toSerializableCartesian3(north),
    upECEF: toSerializableCartesian3(upInPlane),
  };
};

export const computePolygonGroupDerivedData = (
  group: PlanarPolygonGroup,
  pointById: Map<string, Cartesian3>
): PlanarPolygonGroup => {
  const vertices = group.vertexPointIds
    .map((id) => pointById.get(id))
    .filter((value): value is Cartesian3 => Boolean(value));
  if (vertices.length < 3) {
    return {
      ...group,
      areaSquareMeters: 0,
      verticalityDeg: group.verticalityDeg ?? 0,
      surfaceType: group.surfaceType ?? "roof",
    };
  }

  // Keep existing plane if present, otherwise derive one from non-collinear vertices.
  const plane = group.plane ?? derivePlaneFromVertices(vertices);
  if (!plane) {
    return {
      ...group,
      areaSquareMeters: 0,
      verticalityDeg: group.verticalityDeg ?? 0,
      surfaceType: group.surfaceType ?? "roof",
    };
  }

  // Area is meaningful for closed polygons and for preliminary plane-locked polygons.
  const canComputeArea = group.closed || group.planeLocked;
  const areaSquareMeters = canComputeArea
    ? computePlanarPolygonArea(vertices, plane)
    : 0;
  const verticalityDeg = computeVerticalityDeg(plane);
  const surfaceType = group.surfaceType ?? classifySurfaceType(verticalityDeg);
  const planarPolygonLocalFrame =
    surfaceType === "facade"
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
    areaSquareMeters,
    verticalityDeg,
    surfaceType,
  };
};
