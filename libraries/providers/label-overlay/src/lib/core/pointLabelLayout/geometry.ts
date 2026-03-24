import type {
  LabelPlacement,
  Rect,
  CssPixelPosition,
  StemSegment,
} from "./types";

const LABEL_HEIGHT = 20;
const LABEL_CHAR_WIDTH = 7.25;
const LABEL_HORIZONTAL_PADDING = 12;
const LABEL_MIN_WIDTH = 24;
const LABEL_MAX_WIDTH = 260;
const ANCHOR_COLLISION_RADIUS = 8;
const SEGMENT_GEOMETRY_EPSILON = 1e-6;

export const LABEL_COLLISION_PADDING = 4;
export const ANCHOR_LABEL_COLLISION_PADDING = 2;

const estimateLabelWidth = (text: string): number => {
  const estimated = text.length * LABEL_CHAR_WIDTH + LABEL_HORIZONTAL_PADDING;
  return Math.max(LABEL_MIN_WIDTH, Math.min(LABEL_MAX_WIDTH, estimated));
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
  left: anchor.x - ANCHOR_COLLISION_RADIUS,
  top: anchor.y - ANCHOR_COLLISION_RADIUS,
  right: anchor.x + ANCHOR_COLLISION_RADIUS,
  bottom: anchor.y + ANCHOR_COLLISION_RADIUS,
});

export const createLabelRectFromConnector = (
  connector: CssPixelPosition,
  labelText: string,
  attach: LabelPlacement["attach"]
): Rect => {
  const width = estimateLabelWidth(labelText);
  const halfHeight = LABEL_HEIGHT / 2;

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
  Math.abs(value) <= SEGMENT_GEOMETRY_EPSILON;

const isPointWithinSegmentBounds = (
  point: CssPixelPosition,
  segment: StemSegment
): boolean =>
  point.x >=
    Math.min(segment.start.x, segment.end.x) - SEGMENT_GEOMETRY_EPSILON &&
  point.x <=
    Math.max(segment.start.x, segment.end.x) + SEGMENT_GEOMETRY_EPSILON &&
  point.y >=
    Math.min(segment.start.y, segment.end.y) - SEGMENT_GEOMETRY_EPSILON &&
  point.y <=
    Math.max(segment.start.y, segment.end.y) + SEGMENT_GEOMETRY_EPSILON;

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
      SEGMENT_GEOMETRY_EPSILON ||
  Math.max(rightSegment.start.x, rightSegment.end.x) <
    Math.min(leftSegment.start.x, leftSegment.end.x) -
      SEGMENT_GEOMETRY_EPSILON ||
  Math.max(leftSegment.start.y, leftSegment.end.y) <
    Math.min(rightSegment.start.y, rightSegment.end.y) -
      SEGMENT_GEOMETRY_EPSILON ||
  Math.max(rightSegment.start.y, rightSegment.end.y) <
    Math.min(leftSegment.start.y, leftSegment.end.y) - SEGMENT_GEOMETRY_EPSILON;

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
    leftRightStartArea * leftRightEndArea < -SEGMENT_GEOMETRY_EPSILON &&
    rightLeftStartArea * rightLeftEndArea < -SEGMENT_GEOMETRY_EPSILON;

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
