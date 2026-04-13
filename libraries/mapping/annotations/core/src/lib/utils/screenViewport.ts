import type { CssPixelPosition } from "@carma-units";

const isFiniteCssPixelPosition = (position: CssPixelPosition): boolean =>
  Number.isFinite(position.x) && Number.isFinite(position.y);

export const isPointInViewport = (
  screenPosition: CssPixelPosition,
  viewportWidth: number,
  viewportHeight: number,
  paddingHorizontal: number = 0,
  paddingVertical?: number
): boolean => {
  if (
    !isFiniteCssPixelPosition(screenPosition) ||
    !Number.isFinite(viewportWidth) ||
    !Number.isFinite(viewportHeight)
  ) {
    return false;
  }

  const verticalPadding = paddingVertical ?? paddingHorizontal;
  return (
    screenPosition.x >= -paddingHorizontal &&
    screenPosition.x <= viewportWidth + paddingHorizontal &&
    screenPosition.y >= -verticalPadding &&
    screenPosition.y <= viewportHeight + verticalPadding
  );
};
