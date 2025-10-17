import type { ColorRgbaArray } from "@carma/types";
import { isColorRgbaArray } from "../serialization";
import { DEFAULT_BACKGROUND_COLOR } from "../widgetDefaults";

const colorRgbaArrayToCssRgbaString = (color: ColorRgbaArray): string => {
  const [red, green, blue, alpha] = color;
  const r255 = Math.round(red * 255);
  const g255 = Math.round(green * 255);
  const b255 = Math.round(blue * 255);
  return `rgba(${r255}, ${g255}, ${b255}, ${alpha})`;
};

export const setCesiumBackgroundCssVar = (
  color: ColorRgbaArray = DEFAULT_BACKGROUND_COLOR
): void => {
  const validatedColor: ColorRgbaArray = isColorRgbaArray(color)
    ? color
    : DEFAULT_BACKGROUND_COLOR;
  const cssColor = colorRgbaArrayToCssRgbaString(validatedColor);
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
