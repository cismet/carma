// Re-export Color class from Cesium (both type and value)
import { Color } from "cesium";
export { Color };

/**
 * RGBA color array [red, green, blue, alpha] with values 0-1
 */
export type ColorRgbaArray = [number, number, number, number];

/**
 * Convert Cesium Color to RGBA array
 */
export const toColorRgbaArray = (color: Color): ColorRgbaArray => {
  const { red, green, blue, alpha } = color;
  return [red, green, blue, alpha];
};

/**
 * Type guard for ColorRgbaArray
 */
export const isColorRgbaArray = (color: unknown): color is ColorRgbaArray => {
  return (
    Array.isArray(color) &&
    color.length === 4 &&
    color.every((x) => typeof x === "number")
  );
};

/**
 * Convert RGBA array to Cesium Color
 */
export const fromColorRgbaArray = (color: unknown): Color | null => {
  if (!isColorRgbaArray(color)) {
    console.debug("Invalid color array", color);
    return null;
  }
  const [red, green, blue, alpha] = color;
  return new Color(red, green, blue, alpha);
};
