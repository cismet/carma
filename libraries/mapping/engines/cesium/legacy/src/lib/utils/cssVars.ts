import type { ColorConstructorArgs } from "@carma/cesium";
import { isColorConstructorArgs } from "@carma/cesium";
import { DEFAULT_BACKGROUND_COLOR } from "../viewerDefaults";

const colorRgbaArrayToCssRgbaString = (color: ColorConstructorArgs): string => {
  const [red, green, blue, alpha] = color;
  const r255 = Math.round(red * 255);
  const g255 = Math.round(green * 255);
  const b255 = Math.round(blue * 255);
  return `rgba(${r255}, ${g255}, ${b255}, ${alpha})`;
};

export const setCesiumBackgroundCssVar = (
  color: ColorConstructorArgs = DEFAULT_BACKGROUND_COLOR
): void => {
  const validatedColor: ColorConstructorArgs = isColorConstructorArgs(color)
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
