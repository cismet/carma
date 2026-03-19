import type { CssPixelPosition } from "@carma/units/types";

export type ScreenRectangle = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export const buildScreenRectangle = (
  start: CssPixelPosition,
  current: CssPixelPosition
): ScreenRectangle => ({
  left: Math.min(start.x, current.x),
  right: Math.max(start.x, current.x),
  top: Math.min(start.y, current.y),
  bottom: Math.max(start.y, current.y),
});

export const getScreenRectangleSize = (rectangle: ScreenRectangle) => ({
  width: rectangle.right - rectangle.left,
  height: rectangle.bottom - rectangle.top,
});

export const isPointInsideScreenRectangle = (
  point: CssPixelPosition,
  rectangle: ScreenRectangle
): boolean =>
  point.x >= rectangle.left &&
  point.x <= rectangle.right &&
  point.y >= rectangle.top &&
  point.y <= rectangle.bottom;

export const selectPointIdsInScreenRectangle = (
  points: Array<{
    id: string;
    isHidden?: boolean;
    getCanvasPosition?: () => CssPixelPosition | null | undefined;
  }>,
  rectangle: ScreenRectangle
): string[] =>
  points
    .filter((point) => !point.isHidden)
    .flatMap((point) => {
      const canvasPosition = point.getCanvasPosition?.();
      if (!canvasPosition) return [];
      return isPointInsideScreenRectangle(canvasPosition, rectangle)
        ? [point.id]
        : [];
    });
