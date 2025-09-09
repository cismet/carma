import { CssPixelHeight, CssPixelWidth } from "@carma-commons/types";
export type CanvasDimensions = { height: CssPixelHeight; width: CssPixelWidth };

export const getCanvasDimensions = (
  canvas: HTMLCanvasElement
): CanvasDimensions => {
  return {
    height: canvas.clientHeight as CssPixelHeight,
    width: canvas.clientWidth as CssPixelWidth,
  };
};

export default getCanvasDimensions;
