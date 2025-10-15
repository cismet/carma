import type { CssPixelHeight, CssPixelWidth } from "@carma/units/types";
import { isWindow } from "./isWindow";

export type CanvasDimensions = { height: CssPixelHeight; width: CssPixelWidth };

export const getWindowDimensions = (window: Window): CanvasDimensions => {
  if (!isWindow(window))
    throw new Error("getWindowDimensions: window is not valid");
  const ih = window.innerHeight;
  const iw = window.innerWidth;
  if (
    typeof iw !== "number" ||
    typeof ih !== "number" ||
    !Number.isFinite(iw) ||
    !Number.isFinite(ih)
  )
    throw new Error("getWindowDimensions: window inner size is not valid");
  if (iw <= 0 || ih <= 0)
    console.warn("getWindowDimensions: window inner size is zero or negative", {
      innerWidth: iw,
      innerHeight: ih,
    });

  return { width: iw as CssPixelWidth, height: ih as CssPixelHeight };
};
