import type { ColorRgbaArray } from "@carma/types";
import { isColorRgbaArray } from "./cesiumSerializer";

const colorRgbaArrayToCssRgbaString = (
  color: ColorRgbaArray,
  fallback = "rgba(0,0,0,0)"
): string => {
  if (!isColorRgbaArray(color)) return fallback;
  const [red, green, blue, alpha] = color;
  const r255 = Math.round(red * 255);
  const g255 = Math.round(green * 255);
  const b255 = Math.round(blue * 255);
  return `rgba(${r255}, ${g255}, ${b255}, ${alpha})`;
};

export const setCesiumBackgroundCssVar = (
  color: ColorRgbaArray,
  fallback = "rgba(0,0,0,0)"
): void => {
  const cssColor = colorRgbaArrayToCssRgbaString(color, fallback);
  try {
    document.documentElement.style.setProperty("--cesium-bg-color", cssColor);
  } catch (error) {
    console.warn(
      "Failed to set CSS variable",
      error,
      document?.documentElement
    );
  }
};

export default setCesiumBackgroundCssVar;
