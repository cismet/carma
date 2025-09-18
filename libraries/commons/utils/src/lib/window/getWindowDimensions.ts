import { CssPixelHeight, CssPixelWidth } from "@carma/types";

export type CanvasDimensions = { height: CssPixelHeight; width: CssPixelWidth };

export const getWindowDimensions = (
  window: Window | undefined
): CanvasDimensions | undefined => {
  if (!window) return;
  const ih = window.innerHeight;
  const iw = window.innerWidth;
  if (
    typeof iw !== "number" ||
    typeof ih !== "number" ||
    !isFinite(iw) ||
    !isFinite(ih)
  )
    return;
  if (iw <= 0 || ih <= 0)
    console.warn("getWindowDimensions: window inner size is zero or negative", {
      innerWidth: iw,
      innerHeight: ih,
    });

  return { width: iw as CssPixelWidth, height: ih as CssPixelHeight };
};
