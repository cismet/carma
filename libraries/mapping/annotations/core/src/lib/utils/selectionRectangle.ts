export type DragPoint = {
  x: number;
  y: number;
};

export type SelectionRectangle = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export const buildSelectionRectangle = (
  start: DragPoint,
  current: DragPoint
): SelectionRectangle => ({
  left: Math.min(start.x, current.x),
  right: Math.max(start.x, current.x),
  top: Math.min(start.y, current.y),
  bottom: Math.max(start.y, current.y),
});

export const getSelectionRectangleSize = (rectangle: SelectionRectangle) => ({
  width: rectangle.right - rectangle.left,
  height: rectangle.bottom - rectangle.top,
});

export const isPointInsideSelectionRectangle = (
  point: DragPoint,
  rectangle: SelectionRectangle
): boolean =>
  point.x >= rectangle.left &&
  point.x <= rectangle.right &&
  point.y >= rectangle.top &&
  point.y <= rectangle.bottom;

export const selectPointLabelIdsInRectangle = (
  points: Array<{
    id: string;
    isHidden?: boolean;
    getCanvasPosition?: () => DragPoint | null | undefined;
  }>,
  rectangle: SelectionRectangle
): string[] =>
  points
    .filter((point) => !point.isHidden)
    .flatMap((point) => {
      const canvasPosition = point.getCanvasPosition?.();
      if (!canvasPosition) return [];
      return isPointInsideSelectionRectangle(canvasPosition, rectangle)
        ? [point.id]
        : [];
    });
