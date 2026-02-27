import { Cartesian3 } from "@carma/cesium";

import {
  createPlaneFromThreePoints,
  projectPointOntoPlane,
} from "./planarPolygon";

const DIRECTION_EPSILON = 1e-12;
const FACADE_RECTANGLE_COMPONENT_EPSILON_METERS = 0.05;

export type VerticalPolygonLocalFrameVectors = {
  origin: Cartesian3;
  east: Cartesian3;
  north: Cartesian3;
  up: Cartesian3;
};

export type VerticalPolygonLocalFrameSerializable = {
  originECEF: {
    x: number;
    y: number;
    z: number;
  };
  eastECEF: {
    x: number;
    y: number;
    z: number;
  };
  northECEF: {
    x: number;
    y: number;
    z: number;
  };
  upECEF: {
    x: number;
    y: number;
    z: number;
  };
};

export type VerticalPolygonLocalFramePosition = {
  eastMeters: number;
  northMeters: number;
  upMeters: number;
};

export type FacadeAutoCorner = {
  id: string;
  position: Cartesian3;
};

export type FacadeAutoCloseRectangle = {
  autoCorners: FacadeAutoCorner[];
  closedVertexPointIds: string[];
};

export const getLocalUpDirectionAtAnchor = (
  anchorECEF: Cartesian3
): Cartesian3 => Cartesian3.normalize(anchorECEF, new Cartesian3());

export const projectPointToHorizontalPlaneAtAnchor = (
  pointECEF: Cartesian3,
  anchorECEF: Cartesian3
): Cartesian3 => {
  const localUp = getLocalUpDirectionAtAnchor(anchorECEF);
  const delta = Cartesian3.subtract(pointECEF, anchorECEF, new Cartesian3());
  const distanceAlongUp = Cartesian3.dot(delta, localUp);
  return Cartesian3.subtract(
    pointECEF,
    Cartesian3.multiplyByScalar(localUp, distanceAlongUp, new Cartesian3()),
    new Cartesian3()
  );
};

export const normalizeDirection = (
  direction: Cartesian3
): Cartesian3 | null => {
  if (Cartesian3.magnitudeSquared(direction) <= DIRECTION_EPSILON) {
    return null;
  }
  return Cartesian3.normalize(direction, new Cartesian3());
};

export const getSignedAngleDegAroundAxis = (
  fromDirection: Cartesian3,
  toDirection: Cartesian3,
  axisDirection: Cartesian3
): number | null => {
  const normalizedAxis = normalizeDirection(axisDirection);
  if (!normalizedAxis) return null;

  const fromProjected = normalizeDirection(
    Cartesian3.subtract(
      fromDirection,
      Cartesian3.multiplyByScalar(
        normalizedAxis,
        Cartesian3.dot(fromDirection, normalizedAxis),
        new Cartesian3()
      ),
      new Cartesian3()
    )
  );
  const toProjected = normalizeDirection(
    Cartesian3.subtract(
      toDirection,
      Cartesian3.multiplyByScalar(
        normalizedAxis,
        Cartesian3.dot(toDirection, normalizedAxis),
        new Cartesian3()
      ),
      new Cartesian3()
    )
  );
  if (!fromProjected || !toProjected) {
    return null;
  }

  const sinComponent = Cartesian3.dot(
    Cartesian3.cross(fromProjected, toProjected, new Cartesian3()),
    normalizedAxis
  );
  const cosComponent = Math.max(
    -1,
    Math.min(1, Cartesian3.dot(fromProjected, toProjected))
  );
  return (Math.atan2(sinComponent, cosComponent) * 180) / Math.PI;
};

export const getVerticalPolygonAxisRotationSuffix = (
  eastRotationDegVsEnuEast: number | null
): string => {
  if (eastRotationDegVsEnuEast === null) {
    return "";
  }
  const roundedRotationDeg = Math.round(eastRotationDegVsEnuEast * 10) / 10;
  const safeRoundedRotationDeg = Object.is(roundedRotationDeg, -0)
    ? 0
    : roundedRotationDeg;
  const signedRotation =
    safeRoundedRotationDeg > 0
      ? `+${safeRoundedRotationDeg}`
      : `${safeRoundedRotationDeg}`;
  return ` (rot. ${signedRotation}° ggü. ENU-E)`;
};

export const resolveVerticalPolygonLocalFrameVectors = (
  frame: VerticalPolygonLocalFrameSerializable | null | undefined
): VerticalPolygonLocalFrameVectors | null => {
  if (!frame) return null;

  const east = normalizeDirection(
    new Cartesian3(frame.eastECEF.x, frame.eastECEF.y, frame.eastECEF.z)
  );
  const north = normalizeDirection(
    new Cartesian3(frame.northECEF.x, frame.northECEF.y, frame.northECEF.z)
  );
  const up = normalizeDirection(
    new Cartesian3(frame.upECEF.x, frame.upECEF.y, frame.upECEF.z)
  );
  if (!east || !north || !up) {
    return null;
  }

  return {
    origin: new Cartesian3(
      frame.originECEF.x,
      frame.originECEF.y,
      frame.originECEF.z
    ),
    east,
    north,
    up,
  };
};

export const getPositionInVerticalPolygonLocalFrame = (
  position: Cartesian3,
  frame: VerticalPolygonLocalFrameVectors
): VerticalPolygonLocalFramePosition => {
  const delta = Cartesian3.subtract(position, frame.origin, new Cartesian3());
  return {
    eastMeters: Cartesian3.dot(delta, frame.east),
    northMeters: Cartesian3.dot(delta, frame.north),
    upMeters: Cartesian3.dot(delta, frame.up),
  };
};

export const getPositionFromVerticalPolygonLocalFrame = (
  frame: VerticalPolygonLocalFrameVectors,
  eastMeters: number,
  northMeters: number,
  upMeters: number
): Cartesian3 =>
  Cartesian3.add(
    frame.origin,
    Cartesian3.add(
      Cartesian3.multiplyByScalar(frame.east, eastMeters, new Cartesian3()),
      Cartesian3.add(
        Cartesian3.multiplyByScalar(frame.north, northMeters, new Cartesian3()),
        Cartesian3.multiplyByScalar(frame.up, upMeters, new Cartesian3()),
        new Cartesian3()
      ),
      new Cartesian3()
    ),
    new Cartesian3()
  );

export const getPositionWithVerticalOffsetFromAnchor = (
  anchorECEF: Cartesian3,
  verticalOffsetMeters: number
): Cartesian3 =>
  Cartesian3.add(
    anchorECEF,
    Cartesian3.multiplyByScalar(
      getLocalUpDirectionAtAnchor(anchorECEF),
      verticalOffsetMeters,
      new Cartesian3()
    ),
    new Cartesian3()
  );

export const buildFacadeRectangleCornerFromDiagonal = (
  firstCorner: Cartesian3,
  oppositeCorner: Cartesian3
) => {
  const up = Cartesian3.normalize(firstCorner, new Cartesian3());
  const diagonal = Cartesian3.subtract(
    oppositeCorner,
    firstCorner,
    new Cartesian3()
  );
  const verticalMeters = Cartesian3.dot(diagonal, up);
  const verticalComponent = Cartesian3.multiplyByScalar(
    up,
    verticalMeters,
    new Cartesian3()
  );
  const horizontalComponent = Cartesian3.subtract(
    diagonal,
    verticalComponent,
    new Cartesian3()
  );
  const horizontalMeters = Cartesian3.magnitude(horizontalComponent);
  const verticalAbsoluteMeters = Math.abs(verticalMeters);

  if (
    horizontalMeters < FACADE_RECTANGLE_COMPONENT_EPSILON_METERS ||
    verticalAbsoluteMeters < FACADE_RECTANGLE_COMPONENT_EPSILON_METERS
  ) {
    return null;
  }

  const adjacentHorizontalCorner = Cartesian3.add(
    firstCorner,
    horizontalComponent,
    new Cartesian3()
  );
  const adjacentVerticalCorner = Cartesian3.add(
    firstCorner,
    verticalComponent,
    new Cartesian3()
  );

  const planeUpAnchor = Cartesian3.add(firstCorner, up, new Cartesian3());
  const verticalPlane = createPlaneFromThreePoints(
    firstCorner,
    planeUpAnchor,
    adjacentHorizontalCorner
  );

  const enforcedAdjacentHorizontalCorner = verticalPlane
    ? projectPointOntoPlane(adjacentHorizontalCorner, verticalPlane)
    : adjacentHorizontalCorner;
  const enforcedAdjacentVerticalCorner = verticalPlane
    ? projectPointOntoPlane(adjacentVerticalCorner, verticalPlane)
    : adjacentVerticalCorner;

  return {
    adjacentHorizontalCorner: enforcedAdjacentHorizontalCorner,
    adjacentVerticalCorner: enforcedAdjacentVerticalCorner,
  };
};

export const getFacadeRectanglePreviewAreaSquareMeters = (
  firstCorner: Cartesian3,
  oppositeCorner: Cartesian3
): number => {
  const facadeCorners = buildFacadeRectangleCornerFromDiagonal(
    firstCorner,
    oppositeCorner
  );
  if (!facadeCorners) return 0;

  const horizontalMeters = Cartesian3.distance(
    firstCorner,
    facadeCorners.adjacentHorizontalCorner
  );
  const verticalMeters = Cartesian3.distance(
    firstCorner,
    facadeCorners.adjacentVerticalCorner
  );
  return horizontalMeters * verticalMeters;
};

export const buildFacadeAutoCloseRectangle = (
  pointById: Map<string, Cartesian3>,
  firstPointId: string | null,
  secondPointId: string | null
): FacadeAutoCloseRectangle | null => {
  if (!firstPointId || !secondPointId) return null;
  const firstPoint = pointById.get(firstPointId);
  const secondPoint = pointById.get(secondPointId);
  if (!firstPoint || !secondPoint) return null;

  const facadeCorners = buildFacadeRectangleCornerFromDiagonal(
    firstPoint,
    secondPoint
  );
  if (!facadeCorners) return null;

  const uniqueSeed = `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
  const cornerHorizontalId = `point-facade-${uniqueSeed}-h`;
  const cornerVerticalId = `point-facade-${uniqueSeed}-v`;

  return {
    autoCorners: [
      {
        id: cornerHorizontalId,
        position: facadeCorners.adjacentHorizontalCorner,
      },
      {
        id: cornerVerticalId,
        position: facadeCorners.adjacentVerticalCorner,
      },
    ],
    closedVertexPointIds: [
      firstPointId,
      cornerHorizontalId,
      secondPointId,
      cornerVerticalId,
    ],
  };
};
