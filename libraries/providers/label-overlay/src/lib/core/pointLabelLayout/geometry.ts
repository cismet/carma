import type {
  LabelPlacement,
  Rect,
  CssPixelPosition,
  StemSegment,
} from "./types";

const pointLabelLayoutGeometryDefaults = Object.freeze({
  label: Object.freeze({
    height: 20,
    charWidth: 7.25,
    horizontalPadding: 12,
    minWidth: 24,
    maxWidth: 260,
  }),
  anchorCollisionRadius: 8,
  segmentGeometryEpsilon: 1e-6,
});

export const LABEL_COLLISION_PADDING = 4;
export const ANCHOR_LABEL_COLLISION_PADDING = 2;

const estimateLabelWidth = (text: string): number => {
  const estimated =
    text.length * pointLabelLayoutGeometryDefaults.label.charWidth +
    pointLabelLayoutGeometryDefaults.label.horizontalPadding;
  return Math.max(
    pointLabelLayoutGeometryDefaults.label.minWidth,
    Math.min(pointLabelLayoutGeometryDefaults.label.maxWidth, estimated)
  );
};

export const connectorFromPlacement = (
  anchor: CssPixelPosition,
  placement: LabelPlacement
): CssPixelPosition =>
  ({
    x: anchor.x + Math.cos(placement.angleRad) * placement.distance,
    y: anchor.y + Math.sin(placement.angleRad) * placement.distance,
  } as CssPixelPosition);

export const createAnchorRect = (anchor: CssPixelPosition): Rect => ({
  left: anchor.x - pointLabelLayoutGeometryDefaults.anchorCollisionRadius,
  top: anchor.y - pointLabelLayoutGeometryDefaults.anchorCollisionRadius,
  right: anchor.x + pointLabelLayoutGeometryDefaults.anchorCollisionRadius,
  bottom: anchor.y + pointLabelLayoutGeometryDefaults.anchorCollisionRadius,
});

export const createLabelRectFromConnector = (
  connector: CssPixelPosition,
  labelText: string,
  attach: LabelPlacement["attach"]
): Rect => {
  const width = estimateLabelWidth(labelText);
  const halfHeight = pointLabelLayoutGeometryDefaults.label.height / 2;

  switch (attach) {
    case "left":
      return {
        left: connector.x,
        top: connector.y - halfHeight,
        right: connector.x + width,
        bottom: connector.y + halfHeight,
      };
    case "right":
      return {
        left: connector.x - width,
        top: connector.y - halfHeight,
        right: connector.x,
        bottom: connector.y + halfHeight,
      };
    case "center":
      return {
        left: connector.x - width / 2,
        top: connector.y - halfHeight,
        right: connector.x + width / 2,
        bottom: connector.y + halfHeight,
      };
    default:
      return {
        left: connector.x - width / 2,
        top: connector.y - halfHeight,
        right: connector.x + width / 2,
        bottom: connector.y + halfHeight,
      };
  }
};

export const createLabelRect = (
  anchor: CssPixelPosition,
  labelText: string,
  placement: LabelPlacement
): Rect =>
  createLabelRectFromConnector(
    connectorFromPlacement(anchor, placement),
    labelText,
    placement.attach
  );

export const createStemSegment = (
  anchor: CssPixelPosition,
  placement: LabelPlacement
): StemSegment => ({
  start: anchor,
  end: connectorFromPlacement(anchor, placement),
});

export const rectsIntersect = (
  leftRect: Rect,
  rightRect: Rect,
  padding: number = 0
): boolean =>
  leftRect.left < rightRect.right + padding &&
  leftRect.right > rightRect.left - padding &&
  leftRect.top < rightRect.bottom + padding &&
  leftRect.bottom > rightRect.top - padding;

export const getRectCenter = (rect: Rect): CssPixelPosition =>
  ({
    x: (rect.left + rect.right) / 2,
    y: (rect.top + rect.bottom) / 2,
  } as CssPixelPosition);

const signedArea = (
  origin: CssPixelPosition,
  pointA: CssPixelPosition,
  pointB: CssPixelPosition
): number =>
  (pointA.x - origin.x) * (pointB.y - origin.y) -
  (pointA.y - origin.y) * (pointB.x - origin.x);

const isValueNearZero = (value: number): boolean =>
  Math.abs(value) <= pointLabelLayoutGeometryDefaults.segmentGeometryEpsilon;

const isPointWithinSegmentBounds = (
  point: CssPixelPosition,
  segment: StemSegment
): boolean =>
  point.x >=
    Math.min(segment.start.x, segment.end.x) -
      pointLabelLayoutGeometryDefaults.segmentGeometryEpsilon &&
  point.x <=
    Math.max(segment.start.x, segment.end.x) +
      pointLabelLayoutGeometryDefaults.segmentGeometryEpsilon &&
  point.y >=
    Math.min(segment.start.y, segment.end.y) -
      pointLabelLayoutGeometryDefaults.segmentGeometryEpsilon &&
  point.y <=
    Math.max(segment.start.y, segment.end.y) +
      pointLabelLayoutGeometryDefaults.segmentGeometryEpsilon;

const isPointOnSegment = (
  point: CssPixelPosition,
  segment: StemSegment
): boolean =>
  isValueNearZero(signedArea(segment.start, segment.end, point)) &&
  isPointWithinSegmentBounds(point, segment);

const segmentsHaveSeparatedBounds = (
  leftSegment: StemSegment,
  rightSegment: StemSegment
): boolean =>
  Math.max(leftSegment.start.x, leftSegment.end.x) <
    Math.min(rightSegment.start.x, rightSegment.end.x) -
      pointLabelLayoutGeometryDefaults.segmentGeometryEpsilon ||
  Math.max(rightSegment.start.x, rightSegment.end.x) <
    Math.min(leftSegment.start.x, leftSegment.end.x) -
      pointLabelLayoutGeometryDefaults.segmentGeometryEpsilon ||
  Math.max(leftSegment.start.y, leftSegment.end.y) <
    Math.min(rightSegment.start.y, rightSegment.end.y) -
      pointLabelLayoutGeometryDefaults.segmentGeometryEpsilon ||
  Math.max(rightSegment.start.y, rightSegment.end.y) <
    Math.min(leftSegment.start.y, leftSegment.end.y) -
      pointLabelLayoutGeometryDefaults.segmentGeometryEpsilon;

export const stemSegmentsIntersect = (
  leftSegment: StemSegment,
  rightSegment: StemSegment
): boolean => {
  if (segmentsHaveSeparatedBounds(leftSegment, rightSegment)) {
    return false;
  }

  const leftRightStartArea = signedArea(
    leftSegment.start,
    leftSegment.end,
    rightSegment.start
  );
  const leftRightEndArea = signedArea(
    leftSegment.start,
    leftSegment.end,
    rightSegment.end
  );
  const rightLeftStartArea = signedArea(
    rightSegment.start,
    rightSegment.end,
    leftSegment.start
  );
  const rightLeftEndArea = signedArea(
    rightSegment.start,
    rightSegment.end,
    leftSegment.end
  );

  const hasProperIntersection =
    leftRightStartArea * leftRightEndArea <
      -pointLabelLayoutGeometryDefaults.segmentGeometryEpsilon &&
    rightLeftStartArea * rightLeftEndArea <
      -pointLabelLayoutGeometryDefaults.segmentGeometryEpsilon;

  if (hasProperIntersection) {
    return true;
  }

  return (
    (isValueNearZero(leftRightStartArea) &&
      isPointOnSegment(rightSegment.start, leftSegment)) ||
    (isValueNearZero(leftRightEndArea) &&
      isPointOnSegment(rightSegment.end, leftSegment)) ||
    (isValueNearZero(rightLeftStartArea) &&
      isPointOnSegment(leftSegment.start, rightSegment)) ||
    (isValueNearZero(rightLeftEndArea) &&
      isPointOnSegment(leftSegment.end, rightSegment))
  );
};

export const getViewportOverflowPenalty = (
  rect: Rect,
  viewportWidth: number,
  viewportHeight: number
): number => {
  const overflowLeft = Math.max(0, 0 - rect.left);
  const overflowTop = Math.max(0, 0 - rect.top);
  const overflowRight = Math.max(0, rect.right - viewportWidth);
  const overflowBottom = Math.max(0, rect.bottom - viewportHeight);
  return overflowLeft + overflowTop + overflowRight + overflowBottom;
};
