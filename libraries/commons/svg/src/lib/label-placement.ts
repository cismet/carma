import {
  addPoint2d,
  dotPoint2d,
  getMidpoint2d,
  getSegmentFrame2d,
  getSignedPolygonArea2d,
  scalePoint2d,
  subtractPoint2d,
} from "@carma-commons/math";
import {
  PI,
  PI_OVER_TWO,
  type CssPixels,
  type CssPixelPosition,
  type Radians,
  zeroToTwoPi,
} from "@carma-units";

const lineLabelPlacementDefaults = Object.freeze({
  minSegmentLengthPx: 0.0001,
  minSignedAreaTwice: 0.000001,
  lineOffsetPx: 14,
  polygonSegmentOffsetPx: 10,
});

export type LineLabelPlacement = {
  textX: CssPixels;
  textY: CssPixels;
  angleRad: Radians;
};

export const POLYGON_SEGMENT_LABEL_SIDE = {
  INSIDE: "inside",
  OUTSIDE: "outside",
} as const;
export type PolygonSegmentLabelSide =
  (typeof POLYGON_SEGMENT_LABEL_SIDE)[keyof typeof POLYGON_SEGMENT_LABEL_SIDE];

export const POLYGON_SEGMENT_LABEL_ROTATION_MODE = {
  READABLE: "readable",
  CLOCKWISE: "clockwise",
} as const;
export type PolygonSegmentLabelRotationMode =
  (typeof POLYGON_SEGMENT_LABEL_ROTATION_MODE)[keyof typeof POLYGON_SEGMENT_LABEL_ROTATION_MODE];

export const POLYGON_SEGMENT_LABEL_WINDING_ORDER = {
  CCW: "ccw",
  CW: "cw",
} as const;
export type PolygonSegmentLabelWindingOrder =
  (typeof POLYGON_SEGMENT_LABEL_WINDING_ORDER)[keyof typeof POLYGON_SEGMENT_LABEL_WINDING_ORDER];

export const POLYGON_SEGMENT_LABEL_WINDING_POLICY = {
  RESPECT_INPUT: "respect-input",
  ENFORCE_CCW: "enforce-ccw",
  ENFORCE_CW: "enforce-cw",
} as const;
export type PolygonSegmentLabelWindingPolicy =
  (typeof POLYGON_SEGMENT_LABEL_WINDING_POLICY)[keyof typeof POLYGON_SEGMENT_LABEL_WINDING_POLICY];

export type PolygonSegmentLabelPlacement = {
  segmentIndex: number;
  start: CssPixelPosition;
  end: CssPixelPosition;
  anchor: CssPixelPosition;
  rotationRad: Radians;
  lineLengthPx: CssPixels;
  inputWindingOrder: PolygonSegmentLabelWindingOrder | null;
  resolvedWindingOrder: PolygonSegmentLabelWindingOrder;
  insideReferencePoint: CssPixelPosition;
  outsideReferencePoint: CssPixelPosition;
};

export type ComputePolygonSegmentLabelPlacementsOptions = {
  polygon: readonly CssPixelPosition[];
  closed?: boolean;
  side?: PolygonSegmentLabelSide;
  offsetPx?: number;
  rotationMode?: PolygonSegmentLabelRotationMode;
  windingPolicy?: PolygonSegmentLabelWindingPolicy;
  includeDegenerateSegments?: boolean;
};

const toCssPixelPosition = (x: number, y: number): CssPixelPosition => ({
  x: x as CssPixelPosition["x"],
  y: y as CssPixelPosition["y"],
});

const toCssPixels = (value: number): CssPixels => value as CssPixels;

const normalizePolygonVertices = (
  polygon: readonly CssPixelPosition[]
): CssPixelPosition[] => {
  if (polygon.length < 2) {
    return [];
  }

  if (
    polygon[0].x === polygon[polygon.length - 1].x &&
    polygon[0].y === polygon[polygon.length - 1].y
  ) {
    return polygon.slice(0, -1) as CssPixelPosition[];
  }

  return polygon.slice() as CssPixelPosition[];
};

const resolveReadableRotationRad = ({
  dx,
  dy,
  lineLengthPx,
  normalX,
  normalY,
}: {
  dx: number;
  dy: number;
  lineLengthPx: CssPixels;
  normalX: number;
  normalY: number;
}): Radians => {
  if (lineLengthPx <= lineLabelPlacementDefaults.minSegmentLengthPx) {
    return 0 as Radians;
  }

  const rawAngleRad = Math.atan2(dy, dx) as Radians;
  const lineUnitX = dx / lineLengthPx;
  const lineUnitY = dy / lineLengthPx;
  const crossProduct = lineUnitX * normalY - lineUnitY * normalX;
  const sideAdjustedAngleRad =
    crossProduct >= 0 ? rawAngleRad : ((rawAngleRad + PI) as Radians);
  const uprightAngleRad =
    sideAdjustedAngleRad > PI_OVER_TWO &&
    sideAdjustedAngleRad < ((PI + PI_OVER_TWO) as Radians)
      ? ((sideAdjustedAngleRad - PI) as Radians)
      : sideAdjustedAngleRad < -PI_OVER_TWO
      ? ((sideAdjustedAngleRad + PI) as Radians)
      : sideAdjustedAngleRad;

  return zeroToTwoPi(uprightAngleRad);
};

export const resolveLineLabelPlacement = ({
  start,
  end,
  offsetPx = lineLabelPlacementDefaults.lineOffsetPx,
}: {
  start: CssPixelPosition;
  end: CssPixelPosition;
  offsetPx?: number;
}): LineLabelPlacement | null => {
  const segmentFrame = getSegmentFrame2d({
    start,
    end,
    epsilon: lineLabelPlacementDefaults.minSegmentLengthPx,
  });
  if (!segmentFrame) {
    return null;
  }

  const labelOffset = scalePoint2d(segmentFrame.leftUnitNormal, offsetPx);
  const textPoint = addPoint2d(segmentFrame.midpoint, labelOffset);
  const rawAngleRad = Math.atan2(
    segmentFrame.delta.y,
    segmentFrame.delta.x
  ) as Radians;
  const angleRad =
    rawAngleRad > PI_OVER_TWO
      ? zeroToTwoPi((rawAngleRad - PI) as Radians)
      : rawAngleRad < -PI_OVER_TWO
      ? zeroToTwoPi((rawAngleRad + PI) as Radians)
      : zeroToTwoPi(rawAngleRad);

  return {
    textX: toCssPixels(textPoint.x),
    textY: toCssPixels(textPoint.y),
    angleRad,
  };
};

export const resolveLineLabelPlacementWithReference = ({
  start,
  end,
  targetReferencePoint,
  offsetPx = lineLabelPlacementDefaults.lineOffsetPx,
}: {
  start: CssPixelPosition;
  end: CssPixelPosition;
  targetReferencePoint: CssPixelPosition | null;
  offsetPx?: number;
}): LineLabelPlacement | null => {
  const segmentFrame = getSegmentFrame2d({
    start,
    end,
    epsilon: lineLabelPlacementDefaults.minSegmentLengthPx,
  });
  if (!segmentFrame) {
    return null;
  }

  let labelNormal = segmentFrame.leftUnitNormal;

  if (targetReferencePoint) {
    const referenceOffset = subtractPoint2d(
      targetReferencePoint,
      segmentFrame.midpoint
    );
    const dotWithNormal = dotPoint2d(referenceOffset, labelNormal);
    if (dotWithNormal < 0) {
      labelNormal = scalePoint2d(labelNormal, -1);
    }
  }

  const angleRad = resolveReadableRotationRad({
    dx: segmentFrame.delta.x,
    dy: segmentFrame.delta.y,
    lineLengthPx: segmentFrame.length as CssPixels,
    normalX: labelNormal.x,
    normalY: labelNormal.y,
  });
  const labelOffset = scalePoint2d(labelNormal, offsetPx);
  const textPoint = addPoint2d(segmentFrame.midpoint, labelOffset);

  return {
    textX: toCssPixels(textPoint.x),
    textY: toCssPixels(textPoint.y),
    angleRad,
  };
};

export const computePolygonScreenWindingOrder = (
  polygon: readonly CssPixelPosition[]
): PolygonSegmentLabelWindingOrder | null => {
  const vertices = normalizePolygonVertices(polygon);
  if (vertices.length < 3) {
    return null;
  }

  const signedAreaTwice = getSignedPolygonArea2d(vertices) * 2;
  if (Math.abs(signedAreaTwice) <= lineLabelPlacementDefaults.minSignedAreaTwice) {
    return null;
  }
  return signedAreaTwice >= 0
    ? POLYGON_SEGMENT_LABEL_WINDING_ORDER.CCW
    : POLYGON_SEGMENT_LABEL_WINDING_ORDER.CW;
};

export const computePolygonSegmentLabelPlacements = ({
  polygon,
  closed = true,
  side = POLYGON_SEGMENT_LABEL_SIDE.OUTSIDE,
  offsetPx = lineLabelPlacementDefaults.polygonSegmentOffsetPx,
  rotationMode = POLYGON_SEGMENT_LABEL_ROTATION_MODE.READABLE,
  windingPolicy = POLYGON_SEGMENT_LABEL_WINDING_POLICY.ENFORCE_CCW,
  includeDegenerateSegments = false,
}: ComputePolygonSegmentLabelPlacementsOptions): PolygonSegmentLabelPlacement[] => {
  const vertices = normalizePolygonVertices(polygon);
  if (vertices.length < 2) {
    return [];
  }

  const segmentCount = closed ? vertices.length : vertices.length - 1;
  if (segmentCount <= 0) {
    return [];
  }

  const inputWindingOrder = computePolygonScreenWindingOrder(vertices);
  const resolvedWindingOrder =
    windingPolicy === POLYGON_SEGMENT_LABEL_WINDING_POLICY.ENFORCE_CW
      ? POLYGON_SEGMENT_LABEL_WINDING_ORDER.CW
      : windingPolicy === POLYGON_SEGMENT_LABEL_WINDING_POLICY.ENFORCE_CCW
      ? POLYGON_SEGMENT_LABEL_WINDING_ORDER.CCW
      : inputWindingOrder ?? POLYGON_SEGMENT_LABEL_WINDING_ORDER.CCW;
  const insideNormalSign =
    resolvedWindingOrder === POLYGON_SEGMENT_LABEL_WINDING_ORDER.CCW ? 1 : -1;
  const placements: PolygonSegmentLabelPlacement[] = [];

  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    const start = vertices[segmentIndex];
    const end = vertices[(segmentIndex + 1) % vertices.length];
    const segmentFrame = getSegmentFrame2d({
      start,
      end,
      epsilon: lineLabelPlacementDefaults.minSegmentLengthPx,
    });
    if (!segmentFrame && !includeDegenerateSegments) {
      continue;
    }

    const segmentMidpoint = segmentFrame
      ? segmentFrame.midpoint
      : getMidpoint2d(start, end);
    const segmentDelta = segmentFrame?.delta ?? { x: 0, y: 0 };
    const lineLengthPx = (segmentFrame?.length ?? 0) as CssPixels;
    const leftUnitNormal = segmentFrame?.leftUnitNormal ?? { x: 0, y: 0 };
    const insideUnitNormal = scalePoint2d(leftUnitNormal, insideNormalSign);
    const outsideUnitNormal = scalePoint2d(insideUnitNormal, -1);
    const selectedUnitNormal =
      side === POLYGON_SEGMENT_LABEL_SIDE.INSIDE
        ? insideUnitNormal
        : outsideUnitNormal;
    const anchorPoint = addPoint2d(
      segmentMidpoint,
      scalePoint2d(selectedUnitNormal, offsetPx)
    );
    const insideReference = addPoint2d(
      segmentMidpoint,
      scalePoint2d(insideUnitNormal, offsetPx)
    );
    const outsideReference = addPoint2d(
      segmentMidpoint,
      scalePoint2d(outsideUnitNormal, offsetPx)
    );
    const anchor = toCssPixelPosition(anchorPoint.x, anchorPoint.y);
    const insideReferencePoint = toCssPixelPosition(
      insideReference.x,
      insideReference.y
    );
    const outsideReferencePoint = toCssPixelPosition(
      outsideReference.x,
      outsideReference.y
    );

    const rotationRad =
      rotationMode === POLYGON_SEGMENT_LABEL_ROTATION_MODE.CLOCKWISE
        ? zeroToTwoPi(Math.atan2(segmentDelta.y, segmentDelta.x) as Radians)
        : resolveReadableRotationRad({
            dx: segmentDelta.x,
            dy: segmentDelta.y,
            lineLengthPx,
            normalX: selectedUnitNormal.x,
            normalY: selectedUnitNormal.y,
          });

    placements.push({
      segmentIndex,
      start,
      end,
      anchor,
      rotationRad,
      lineLengthPx,
      inputWindingOrder,
      resolvedWindingOrder,
      insideReferencePoint,
      outsideReferencePoint,
    });
  }

  return placements;
};
