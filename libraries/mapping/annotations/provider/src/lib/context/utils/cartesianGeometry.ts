import { Cartesian3 } from "@carma/cesium";

import {
  createPlaneFromThreePoints,
  projectPointOntoPlane,
} from "./planarPolygon";

const FACADE_RECTANGLE_COMPONENT_EPSILON_METERS = 0.05;

export type FacadeAutoCorner = {
  id: string;
  position: Cartesian3;
};

export type FacadeAutoCloseRectangle = {
  autoCorners: FacadeAutoCorner[];
  closedVertexPointIds: string[];
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
