import type { LabelPlacement, Rect, ScreenPoint } from "./types";

const LABEL_HEIGHT = 20;
const LABEL_CHAR_WIDTH = 7.25;
const LABEL_HORIZONTAL_PADDING = 12;
const LABEL_MIN_WIDTH = 52;
const LABEL_MAX_WIDTH = 260;
const ANCHOR_COLLISION_RADIUS = 8;

export const LABEL_COLLISION_PADDING = 4;
export const ANCHOR_LABEL_COLLISION_PADDING = 2;

const estimateLabelWidth = (text: string): number => {
  const estimated = text.length * LABEL_CHAR_WIDTH + LABEL_HORIZONTAL_PADDING;
  return Math.max(LABEL_MIN_WIDTH, Math.min(LABEL_MAX_WIDTH, estimated));
};

export const connectorFromPlacement = (
  anchor: ScreenPoint,
  placement: LabelPlacement
): ScreenPoint => ({
  x: anchor.x + Math.cos(placement.angleRad) * placement.distance,
  y: anchor.y + Math.sin(placement.angleRad) * placement.distance,
});

export const createAnchorRect = (anchor: ScreenPoint): Rect => ({
  left: anchor.x - ANCHOR_COLLISION_RADIUS,
  top: anchor.y - ANCHOR_COLLISION_RADIUS,
  right: anchor.x + ANCHOR_COLLISION_RADIUS,
  bottom: anchor.y + ANCHOR_COLLISION_RADIUS,
});

export const createLabelRectFromConnector = (
  connector: ScreenPoint,
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
  anchor: ScreenPoint,
  labelText: string,
  placement: LabelPlacement
): Rect =>
  createLabelRectFromConnector(
    connectorFromPlacement(anchor, placement),
    labelText,
    placement.attach
  );

export const rectsIntersect = (
  leftRect: Rect,
  rightRect: Rect,
  padding: number = 0
): boolean =>
  leftRect.left < rightRect.right + padding &&
  leftRect.right > rightRect.left - padding &&
  leftRect.top < rightRect.bottom + padding &&
  leftRect.bottom > rightRect.top - padding;

export const getRectCenter = (rect: Rect): ScreenPoint => ({
  x: (rect.left + rect.right) / 2,
  y: (rect.top + rect.bottom) / 2,
});

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
