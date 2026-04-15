import {
  Cartesian3,
  Cartesian4,
  Ellipsoid,
  Matrix4,
  Transforms,
} from "@carma-cesium";

const VERTICAL_RECTANGLE_COMPONENT_EPSILON_METERS = 0.05;
const PLANE_NORMAL_EPSILON = 1e-8;

type PreviewPlane = {
  anchorECEF: Cartesian3;
  normalECEF: Cartesian3;
};

const getEllipsoidalUpAtPoint = (anchorECEF: Cartesian3): Cartesian3 => {
  const eastNorthUpFrame = Transforms.eastNorthUpToFixedFrame(
    anchorECEF,
    Ellipsoid.WGS84
  );
  const upColumn = Matrix4.getColumn(eastNorthUpFrame, 2, new Cartesian4());

  return Cartesian3.normalize(
    new Cartesian3(upColumn.x, upColumn.y, upColumn.z),
    new Cartesian3()
  );
};

const createPlaneFromThreePoints = (
  a: Cartesian3,
  b: Cartesian3,
  c: Cartesian3
): PreviewPlane | null => {
  const ab = Cartesian3.subtract(b, a, new Cartesian3());
  const ac = Cartesian3.subtract(c, a, new Cartesian3());
  const normal = Cartesian3.cross(ab, ac, new Cartesian3());
  if (Cartesian3.magnitudeSquared(normal) <= PLANE_NORMAL_EPSILON) return null;

  return {
    anchorECEF: Cartesian3.clone(a),
    normalECEF: Cartesian3.normalize(normal, new Cartesian3()),
  };
};

const projectPointOntoPlane = (
  point: Cartesian3,
  plane: PreviewPlane
): Cartesian3 => {
  const delta = Cartesian3.subtract(point, plane.anchorECEF, new Cartesian3());
  const distanceAlongNormal = Cartesian3.dot(delta, plane.normalECEF);
  return Cartesian3.subtract(
    point,
    Cartesian3.multiplyByScalar(
      plane.normalECEF,
      distanceAlongNormal,
      new Cartesian3()
    ),
    new Cartesian3()
  );
};

export type VerticalAutoCorner = {
  id: string;
  position: Cartesian3;
};

export type VerticalAutoCloseRectangle = {
  autoCorners: VerticalAutoCorner[];
  closedNodeIds: string[];
};

export const buildVerticalRectangleCornerFromDiagonal = (
  firstCorner: Cartesian3,
  oppositeCorner: Cartesian3
) => {
  const up = getEllipsoidalUpAtPoint(firstCorner);
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
    horizontalMeters < VERTICAL_RECTANGLE_COMPONENT_EPSILON_METERS ||
    verticalAbsoluteMeters < VERTICAL_RECTANGLE_COMPONENT_EPSILON_METERS
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

  return {
    adjacentHorizontalCorner: verticalPlane
      ? projectPointOntoPlane(adjacentHorizontalCorner, verticalPlane)
      : adjacentHorizontalCorner,
    adjacentVerticalCorner: verticalPlane
      ? projectPointOntoPlane(adjacentVerticalCorner, verticalPlane)
      : adjacentVerticalCorner,
  };
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

export const getVerticalRectanglePreviewAreaSquareMeters = (
  firstCorner: Cartesian3,
  oppositeCorner: Cartesian3
): number => {
  const verticalCorners = buildVerticalRectangleCornerFromDiagonal(
    firstCorner,
    oppositeCorner
  );
  if (!verticalCorners) return 0;

  const horizontalMeters = Cartesian3.distance(
    firstCorner,
    verticalCorners.adjacentHorizontalCorner
  );
  const verticalMeters = Cartesian3.distance(
    firstCorner,
    verticalCorners.adjacentVerticalCorner
  );
  return horizontalMeters * verticalMeters;
};

export const buildVerticalAutoCloseRectangle = (
  pointById: Map<string, Cartesian3>,
  firstPointId: string | null,
  secondPointId: string | null
): VerticalAutoCloseRectangle | null => {
  if (!firstPointId || !secondPointId) return null;
  const firstPoint = pointById.get(firstPointId);
  const secondPoint = pointById.get(secondPointId);
  if (!firstPoint || !secondPoint) return null;

  const verticalCorners = buildVerticalRectangleCornerFromDiagonal(
    firstPoint,
    secondPoint
  );
  if (!verticalCorners) return null;

  const uniqueSeed = `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
  const cornerHorizontalId = `point-vertical-${uniqueSeed}-h`;
  const cornerVerticalId = `point-vertical-${uniqueSeed}-v`;

  return {
    autoCorners: [
      {
        id: cornerHorizontalId,
        position: verticalCorners.adjacentHorizontalCorner,
      },
      {
        id: cornerVerticalId,
        position: verticalCorners.adjacentVerticalCorner,
      },
    ],
    closedNodeIds: [
      firstPointId,
      cornerHorizontalId,
      secondPointId,
      cornerVerticalId,
    ],
  };
};
