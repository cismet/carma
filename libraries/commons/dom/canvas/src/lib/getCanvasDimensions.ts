import type { CssPixels, CssPixelDimensions } from "@carma/units/types";

export const getCanvasDimensions = (
  canvas: HTMLCanvasElement
): CssPixelDimensions => {
  return {
    height: canvas.clientHeight as CssPixels,
    width: canvas.clientWidth as CssPixels,
  };
};

export default getCanvasDimensions;
