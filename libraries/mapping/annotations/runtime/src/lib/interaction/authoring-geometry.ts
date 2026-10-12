import { Vector3 } from "three";
import {
  cartographicToEcef,
  ecefFromGeographicCoordinate,
  ecefToCartographic,
} from "@carma-geo/proj";
import {
  buildVerticalRectangleCornerFromDiagonal,
  type AnnotationGeographicCoordinate,
  type AnnotationEngine,
} from "@carma-mapping/annotations/core";

export type AnnotationGeometryScratch = {
  auxiliaryPoint: Vector3;
  auxiliaryScreen: { x: number; y: number };
};

export type DistanceTriangleComponentLabelVisibility = {
  showVerticalLabel: boolean;
  showHorizontalLabel: boolean;
};

export const resolveDistanceTriangleComponentLabelVisibility = ({
  directLabelText,
  verticalLabelText,
  horizontalLabelText,
}: {
  directLabelText: string;
  verticalLabelText: string | null;
  horizontalLabelText: string | null;
}): DistanceTriangleComponentLabelVisibility => ({
  showVerticalLabel:
    verticalLabelText !== null && verticalLabelText !== directLabelText,
  showHorizontalLabel:
    horizontalLabelText !== null && horizontalLabelText !== directLabelText,
});

export const createAnnotationGeometryScratch =
  (): AnnotationGeometryScratch => ({
    auxiliaryPoint: new Vector3(),
    auxiliaryScreen: { x: 0, y: 0 },
  });

/**
 * The auxiliary corner of a distance triangle: the anchor's longitude and
 * latitude at the target's ellipsoidal height. `engine` is ignored; callers
 * still pass it.
 */
export const buildAuxiliaryPoint = ({
  anchorPointECEF,
  targetPointECEF,
  scratch,
}: {
  engine?: AnnotationEngine | null;
  anchorPointECEF: Vector3;
  targetPointECEF: Vector3;
  scratch: AnnotationGeometryScratch;
}) => {
  const anchorCartographic = ecefToCartographic(anchorPointECEF);
  const targetCartographic = ecefToCartographic(targetPointECEF);
  if (
    !Number.isFinite(anchorCartographic.longitude) ||
    !Number.isFinite(anchorCartographic.latitude) ||
    !Number.isFinite(targetCartographic.altitude)
  ) {
    return null;
  }

  return cartographicToEcef(
    anchorCartographic.longitude,
    anchorCartographic.latitude,
    targetCartographic.altitude,
    scratch.auxiliaryPoint
  );
};

export const buildVerticalAreaLoopCoordinates = ({
  firstCorner,
  oppositeCorner,
}: {
  firstCorner: AnnotationGeographicCoordinate;
  oppositeCorner: AnnotationGeographicCoordinate;
}) => {
  const firstCornerECEF = ecefFromGeographicCoordinate(firstCorner);
  const oppositeCornerECEF = ecefFromGeographicCoordinate(oppositeCorner);
  const verticalCorners = buildVerticalRectangleCornerFromDiagonal(
    firstCornerECEF,
    oppositeCornerECEF
  );
  if (!verticalCorners) {
    return null;
  }

  return [
    firstCornerECEF,
    verticalCorners.adjacentHorizontalCorner,
    oppositeCornerECEF,
    verticalCorners.adjacentVerticalCorner,
    firstCornerECEF,
  ] as const;
};
