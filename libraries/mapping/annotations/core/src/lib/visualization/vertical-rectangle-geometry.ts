import { Vector3 } from "three";

import {
  getEllipsoidalUpDirectionAtAnchor,
  getNormalizedTriangleNormal,
  projectVector3OntoPlane,
  removeVector3ComponentAlongAxis,
} from "../geometry";

const verticalRectangleGeometryDefaults = Object.freeze({
  componentEpsilonMeters: 0.05,
});

type PreviewPlane = {
  anchorECEF: Vector3;
  normalECEF: Vector3;
};

const createPlaneFromThreePoints = (
  a: Vector3,
  b: Vector3,
  c: Vector3
): PreviewPlane | null => {
  const normal = getNormalizedTriangleNormal(a, b, c);
  if (!normal) return null;

  return {
    anchorECEF: a.clone(),
    normalECEF: normal,
  };
};

const projectPointOntoPlane = (point: Vector3, plane: PreviewPlane): Vector3 =>
  projectVector3OntoPlane(point, plane.anchorECEF, plane.normalECEF);

export type VerticalAutoCorner = {
  id: string;
  position: Vector3;
};

export type VerticalAutoCloseRectangle = {
  autoCorners: VerticalAutoCorner[];
  closedNodeIds: string[];
};

export const buildVerticalRectangleCornerFromDiagonal = (
  firstCorner: Vector3,
  oppositeCorner: Vector3
) => {
  const up = getEllipsoidalUpDirectionAtAnchor(firstCorner);
  const diagonal = new Vector3().subVectors(oppositeCorner, firstCorner);
  const verticalMeters = diagonal.dot(up);
  const verticalComponent = new Vector3()
    .copy(up)
    .multiplyScalar(verticalMeters);
  const horizontalComponent = removeVector3ComponentAlongAxis(diagonal, up);
  const horizontalMeters = horizontalComponent.length();
  const verticalAbsoluteMeters = Math.abs(verticalMeters);

  if (
    horizontalMeters <
      verticalRectangleGeometryDefaults.componentEpsilonMeters ||
    verticalAbsoluteMeters <
      verticalRectangleGeometryDefaults.componentEpsilonMeters
  ) {
    return null;
  }

  const adjacentHorizontalCorner = new Vector3().addVectors(
    firstCorner,
    horizontalComponent
  );
  const adjacentVerticalCorner = new Vector3().addVectors(
    firstCorner,
    verticalComponent
  );

  const planeUpAnchor = new Vector3().addVectors(firstCorner, up);
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
  firstCorner: Vector3,
  oppositeCorner: Vector3
): number => {
  const verticalCorners = buildVerticalRectangleCornerFromDiagonal(
    firstCorner,
    oppositeCorner
  );
  if (!verticalCorners) return 0;

  const horizontalMeters = firstCorner.distanceTo(
    verticalCorners.adjacentHorizontalCorner
  );
  const verticalMeters = firstCorner.distanceTo(
    verticalCorners.adjacentVerticalCorner
  );
  return horizontalMeters * verticalMeters;
};

export const buildVerticalAutoCloseRectangle = (
  pointById: Map<string, Vector3>,
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
