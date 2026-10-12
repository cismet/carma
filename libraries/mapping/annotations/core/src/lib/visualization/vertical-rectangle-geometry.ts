import {
  getNormalizedTriangleNormal,
  projectVector3OntoPlane,
  removeVector3ComponentAlongAxis,
} from "@carma-commons/math";
import { getEllipsoidalUpDirectionAtAnchor } from "@carma-geo/proj";
import { Vector3 } from "three";

const verticalRectangleGeometryDefaults = Object.freeze({
  componentEpsilonMeters: 0.05,
});

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
  const verticalNormal = getNormalizedTriangleNormal(
    firstCorner,
    planeUpAnchor,
    adjacentHorizontalCorner
  );
  const projectOntoVerticalPlane = (point: Vector3): Vector3 =>
    verticalNormal
      ? projectVector3OntoPlane(point, firstCorner, verticalNormal)
      : point;

  return {
    adjacentHorizontalCorner: projectOntoVerticalPlane(
      adjacentHorizontalCorner
    ),
    adjacentVerticalCorner: projectOntoVerticalPlane(adjacentVerticalCorner),
  };
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
