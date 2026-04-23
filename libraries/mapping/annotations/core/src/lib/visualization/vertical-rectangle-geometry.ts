import { Cartesian3 } from "@carma-cesium";
import {
  getEllipsoidalUpDirectionAtAnchor,
  getNormalizedCartesian3TriangleNormal,
  projectCartesian3PointOntoPlane,
  removeCartesian3ComponentAlongAxis,
} from "@carma-mapping/engines/cesium/core";

const verticalRectangleGeometryDefaults = Object.freeze({
  componentEpsilonMeters: 0.05,
});

type PreviewPlane = {
  anchorECEF: Cartesian3;
  normalECEF: Cartesian3;
};

const createPlaneFromThreePoints = (
  a: Cartesian3,
  b: Cartesian3,
  c: Cartesian3
): PreviewPlane | null => {
  const normal = getNormalizedCartesian3TriangleNormal(a, b, c);
  if (!normal) return null;

  return {
    anchorECEF: Cartesian3.clone(a),
    normalECEF: normal,
  };
};

const projectPointOntoPlane = (
  point: Cartesian3,
  plane: PreviewPlane
): Cartesian3 =>
  projectCartesian3PointOntoPlane(point, plane.anchorECEF, plane.normalECEF);

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
  const up = getEllipsoidalUpDirectionAtAnchor(firstCorner);
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
  const horizontalComponent = removeCartesian3ComponentAlongAxis(diagonal, up);
  const horizontalMeters = Cartesian3.magnitude(horizontalComponent);
  const verticalAbsoluteMeters = Math.abs(verticalMeters);

  if (
    horizontalMeters <
      verticalRectangleGeometryDefaults.componentEpsilonMeters ||
    verticalAbsoluteMeters <
      verticalRectangleGeometryDefaults.componentEpsilonMeters
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
