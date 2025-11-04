// Re-export Color class from Cesium (both type and value)
import { Color } from "cesium";
export { Color };

// see also @carma-commons/utils colors.ts for predefined colors in cesium compatible format

/**
 * Serializable object representation of Color
 */
export type ColorJson = Pick<Color, "red" | "green" | "blue" | "alpha">;

/**
 * RGBA color array [red, green, blue, alpha] with values 0-1
 */
export type ColorConstructorArgs = [
  red: number,
  green: number,
  blue: number,
  alpha: number
];

/**
 * Convert Cesium Color to constructor args array
 */
export const colorToConstructorArgs = (color: Color): ColorConstructorArgs => {
  const { red, green, blue, alpha } = color;
  return [red, green, blue, alpha];
};

/**
 * Type guard for ColorConstructorArgs
 */
export const isColorConstructorArgs = (
  color: unknown
): color is ColorConstructorArgs => {
  return (
    Array.isArray(color) &&
    color.length === 4 &&
    color.every((x) => typeof x === "number")
  );
};

/**
 * Convert constructor args array to Cesium Color
 */
export const colorFromConstructorArgs = (color: unknown): Color | null => {
  if (!isColorConstructorArgs(color)) {
    console.debug("Invalid color array", color);
    return null;
  }
  const [red, green, blue, alpha] = color;
  return new Color(red, green, blue, alpha);
};
