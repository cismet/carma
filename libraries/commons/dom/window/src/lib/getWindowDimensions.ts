import type { CssPixels, CssPixelDimensions } from "@carma/units/types";
import { isWindow } from "./isWindow";

export const getWindowDimensions = (window: Window): CssPixelDimensions => {
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

  return { width: iw as CssPixels, height: ih as CssPixels };
};
