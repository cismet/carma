import { clamp } from "@carma-commons/math";
import type { CssPixelPosition } from "@carma-units";

import type { LabelPlacement, Rect, StemSegment } from "./types";

const LABEL_HEIGHT = 20;
const LABEL_CHAR_WIDTH = 7.25;
const LABEL_HORIZONTAL_PADDING = 12;
const LABEL_MIN_WIDTH = 24;
const LABEL_MAX_WIDTH = 260;
const ANCHOR_COLLISION_RADIUS = 8;
const SEGMENT_EPSILON = 1e-6;

export const LABEL_COLLISION_PADDING = 4;
export const ANCHOR_LABEL_COLLISION_PADDING = 2;

const estimateLabelWidth = (text: string): number =>
  clamp(
    text.length * LABEL_CHAR_WIDTH + LABEL_HORIZONTAL_PADDING,
    LABEL_MIN_WIDTH,
    LABEL_MAX_WIDTH
  );

const connectorFromPlacement = (
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
  const [fromX, toX] =
    attach === "left"
      ? [0, width]
      : attach === "right"
      ? [-width, 0]
      : [-width / 2, width / 2];

  return {
    left: connector.x + fromX,
    top: connector.y - halfHeight,
    right: connector.x + toX,
    bottom: connector.y + halfHeight,
  };
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

export const getViewportOverflowPenalty = (
  rect: Rect,
  viewportWidth: number,
  viewportHeight: number
): number =>
  Math.max(0, -rect.left) +
  Math.max(0, -rect.top) +
  Math.max(0, rect.right - viewportWidth) +
  Math.max(0, rect.bottom - viewportHeight);

const signedArea = (
  origin: CssPixelPosition,
  pointA: CssPixelPosition,
  pointB: CssPixelPosition
): number =>
  (pointA.x - origin.x) * (pointB.y - origin.y) -
  (pointA.y - origin.y) * (pointB.x - origin.x);

const isNearZero = (value: number): boolean =>
  Math.abs(value) <= SEGMENT_EPSILON;

const isWithinRange = (value: number, boundA: number, boundB: number) =>
  value >= Math.min(boundA, boundB) - SEGMENT_EPSILON &&
  value <= Math.max(boundA, boundB) + SEGMENT_EPSILON;

const areRangesSeparated = (
  startA: number,
  endA: number,
  startB: number,
  endB: number
): boolean =>
  Math.max(startA, endA) < Math.min(startB, endB) - SEGMENT_EPSILON ||
  Math.max(startB, endB) < Math.min(startA, endA) - SEGMENT_EPSILON;

const isPointOnSegment = (
  point: CssPixelPosition,
  segment: StemSegment
): boolean =>
  isNearZero(signedArea(segment.start, segment.end, point)) &&
  isWithinRange(point.x, segment.start.x, segment.end.x) &&
  isWithinRange(point.y, segment.start.y, segment.end.y);

/**
 * Crossing or touching of two stems. Unlike `doSegmentsIntersect2d`, an
 * endpoint resting on the other stem counts as an intersection.
 */
export const stemSegmentsIntersect = (
  left: StemSegment,
  right: StemSegment
): boolean => {
  if (
    areRangesSeparated(left.start.x, left.end.x, right.start.x, right.end.x) ||
    areRangesSeparated(left.start.y, left.end.y, right.start.y, right.end.y)
  ) {
    return false;
  }

  const rightStartSide = signedArea(left.start, left.end, right.start);
  const rightEndSide = signedArea(left.start, left.end, right.end);
  const leftStartSide = signedArea(right.start, right.end, left.start);
  const leftEndSide = signedArea(right.start, right.end, left.end);

  if (
    rightStartSide * rightEndSide < -SEGMENT_EPSILON &&
    leftStartSide * leftEndSide < -SEGMENT_EPSILON
  ) {
    return true;
  }

  return (
    (isNearZero(rightStartSide) && isPointOnSegment(right.start, left)) ||
    (isNearZero(rightEndSide) && isPointOnSegment(right.end, left)) ||
    (isNearZero(leftStartSide) && isPointOnSegment(left.start, right)) ||
    (isNearZero(leftEndSide) && isPointOnSegment(left.end, right))
  );
};
