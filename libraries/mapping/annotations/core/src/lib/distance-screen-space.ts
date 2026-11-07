import {
  addPoint2d,
  clamp,
  dotPoint2d,
  getPolygonCentroid2d,
  getSegmentFrame2d,
  lerp,
  scalePoint2d,
  subtractPoint2d,
} from "@carma-commons/math";
import type { CssPixelPosition } from "@carma-units";

const distanceScreenSpaceDefaults = Object.freeze({
  lineLengthEpsilonPx: 1e-3,
  referenceDistanceFactor: 0.2,
  lineLabelReferenceDistancePx: 24,
  flipThresholdPx: 4,
  referenceMinDistancePx: 24,
  referenceMaxDistancePx: 48,
  insideBlendFactor: 0.35,
  elevationEpsilonMeters: 0.001,
  polygonAreaEpsilonPx2: 1e-6,
});

type DistanceScreenTriangle = {
  anchor: CssPixelPosition;
  target: CssPixelPosition;
  aux: CssPixelPosition;
  centroid: CssPixelPosition;
  highest: CssPixelPosition;
};

type DistanceTriangleLineLabelKind = "direct" | "vertical" | "horizontal";

export type DistanceTriangleLineLabelOutsideSigns = Partial<
  Record<DistanceTriangleLineLabelKind, -1 | 1>
>;

export type DistanceTriangleLineLabelReferences = {
  directOutsideReferencePoint: CssPixelPosition | null;
  verticalOutsideReferencePoint: CssPixelPosition | null;
  horizontalOutsideReferencePoint: CssPixelPosition | null;
  nextOutsideSigns: DistanceTriangleLineLabelOutsideSigns;
};

type OutsideReferencePoint2D = {
  outsideSign: -1 | 1;
  referencePoint: CssPixelPosition;
};

const resolveStableSideSign = (
  signedDistance: number,
  previousSign: -1 | 1 | undefined,
  flipThresholdPx: number = distanceScreenSpaceDefaults.flipThresholdPx
): -1 | 1 => {
  if (!Number.isFinite(signedDistance)) return previousSign ?? 1;
  const nextSign: -1 | 1 = signedDistance >= 0 ? 1 : -1;
  if (!previousSign || previousSign === nextSign) return nextSign;
  if (Math.abs(signedDistance) < flipThresholdPx) return previousSign;
  return nextSign;
};

export const resolveOutsideReferencePoint2D = ({
  start,
  end,
  insidePoint,
  previousOutsideSign,
  flipThresholdPx = distanceScreenSpaceDefaults.flipThresholdPx,
  referenceDistanceFactor = distanceScreenSpaceDefaults.referenceDistanceFactor,
  referenceDistancePx,
  minDistancePx = distanceScreenSpaceDefaults.referenceMinDistancePx,
  maxDistancePx = distanceScreenSpaceDefaults.referenceMaxDistancePx,
}: {
  start: CssPixelPosition;
  end: CssPixelPosition;
  insidePoint: CssPixelPosition;
  previousOutsideSign?: -1 | 1;
  flipThresholdPx?: number;
  referenceDistanceFactor?: number;
  referenceDistancePx?: number;
  minDistancePx?: number;
  maxDistancePx?: number;
}): OutsideReferencePoint2D | null => {
  const edgeFrame = getSegmentFrame2d({
    start,
    end,
    epsilon: distanceScreenSpaceDefaults.lineLengthEpsilonPx,
  });
  if (!edgeFrame) {
    return null;
  }

  const insideOffset = subtractPoint2d(insidePoint, edgeFrame.midpoint);
  const insideProjection = dotPoint2d(insideOffset, edgeFrame.leftUnitNormal);
  const outsideSign = resolveStableSideSign(
    -insideProjection,
    previousOutsideSign,
    flipThresholdPx
  );
  const resolvedReferenceDistancePx =
    referenceDistancePx ??
    clamp(
      edgeFrame.length * referenceDistanceFactor,
      minDistancePx,
      maxDistancePx
    );
  const referenceOffset = scalePoint2d(
    edgeFrame.leftUnitNormal,
    outsideSign * resolvedReferenceDistancePx
  );

  return {
    outsideSign,
    referencePoint: addPoint2d(
      edgeFrame.midpoint,
      referenceOffset
    ) as CssPixelPosition,
  };
};

export const buildOutsideReferencePoint2D = (
  start: CssPixelPosition,
  end: CssPixelPosition,
  insidePoint: CssPixelPosition,
  minDistancePx = distanceScreenSpaceDefaults.referenceMinDistancePx,
  maxDistancePx = distanceScreenSpaceDefaults.referenceMaxDistancePx
): CssPixelPosition | null =>
  resolveOutsideReferencePoint2D({
    start,
    end,
    insidePoint,
    minDistancePx,
    maxDistancePx,
  })?.referencePoint ?? null;

const buildDistanceTriangleInsidePoint2D = ({
  triangle,
  auxiliaryAltitudeMeters,
  highestAltitudeMeters,
  insideBlendFactor = distanceScreenSpaceDefaults.insideBlendFactor,
  elevationEpsilonMeters = distanceScreenSpaceDefaults.elevationEpsilonMeters,
}: {
  triangle: DistanceScreenTriangle;
  auxiliaryAltitudeMeters: number;
  highestAltitudeMeters: number;
  insideBlendFactor?: number;
  elevationEpsilonMeters?: number;
}): CssPixelPosition => {
  const elevationDriverPoint =
    auxiliaryAltitudeMeters < highestAltitudeMeters - elevationEpsilonMeters
      ? triangle.highest
      : triangle.aux;
  return {
    x: lerp(elevationDriverPoint.x, triangle.centroid.x, insideBlendFactor),
    y: lerp(elevationDriverPoint.y, triangle.centroid.y, insideBlendFactor),
  } as CssPixelPosition;
};

export const buildDistanceTriangleLineLabelReferences = ({
  anchor,
  target,
  aux,
  anchorAltitudeMeters,
  targetAltitudeMeters,
  previousOutsideSigns,
  insideBlendFactor = distanceScreenSpaceDefaults.insideBlendFactor,
  flipThresholdPx = distanceScreenSpaceDefaults.flipThresholdPx,
  referenceDistancePx = distanceScreenSpaceDefaults.lineLabelReferenceDistancePx,
}: {
  anchor: CssPixelPosition;
  target: CssPixelPosition;
  aux: CssPixelPosition;
  anchorAltitudeMeters: number;
  targetAltitudeMeters: number;
  previousOutsideSigns?: DistanceTriangleLineLabelOutsideSigns;
  insideBlendFactor?: number;
  flipThresholdPx?: number;
  referenceDistancePx?: number;
}): DistanceTriangleLineLabelReferences => {
  const highest =
    anchorAltitudeMeters >= targetAltitudeMeters ? anchor : target;
  const triangle: DistanceScreenTriangle = {
    anchor,
    target,
    aux,
    highest,
    centroid: {
      x: (anchor.x + target.x + aux.x) / 3,
      y: (anchor.y + target.y + aux.y) / 3,
    } as CssPixelPosition,
  };
  const insidePoint = buildDistanceTriangleInsidePoint2D({
    triangle,
    auxiliaryAltitudeMeters: targetAltitudeMeters,
    highestAltitudeMeters: Math.max(anchorAltitudeMeters, targetAltitudeMeters),
    insideBlendFactor,
  });
  const directReference = resolveOutsideReferencePoint2D({
    start: anchor,
    end: target,
    insidePoint,
    previousOutsideSign: previousOutsideSigns?.direct,
    flipThresholdPx,
    referenceDistancePx,
  });
  const horizontalReference = resolveOutsideReferencePoint2D({
    start: aux,
    end: target,
    insidePoint,
    previousOutsideSign: previousOutsideSigns?.horizontal,
    flipThresholdPx,
    referenceDistancePx,
  });
  const verticalReference = resolveOutsideReferencePoint2D({
    start: anchor,
    end: aux,
    insidePoint: target,
    previousOutsideSign: previousOutsideSigns?.vertical,
    flipThresholdPx,
    referenceDistancePx,
  });

  return {
    directOutsideReferencePoint: directReference?.referencePoint ?? null,
    verticalOutsideReferencePoint: verticalReference?.referencePoint ?? null,
    horizontalOutsideReferencePoint:
      horizontalReference?.referencePoint ?? null,
    nextOutsideSigns: {
      direct: directReference?.outsideSign,
      vertical: verticalReference?.outsideSign,
      horizontal: horizontalReference?.outsideSign,
    },
  };
};

export const computePolygonCentroid2D = (points: readonly CssPixelPosition[]) =>
  getPolygonCentroid2d({
    points,
    degenerateAreaEpsilon: distanceScreenSpaceDefaults.polygonAreaEpsilonPx2,
  }) as CssPixelPosition | null;
