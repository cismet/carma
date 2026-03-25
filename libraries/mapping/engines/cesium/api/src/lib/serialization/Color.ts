import { Color } from "../cesium";

/**
 * Serializable object representation of Color.
 */
export type ColorJson = Pick<Color, "red" | "green" | "blue" | "alpha">;

/**
 * RGBA color array [red, green, blue, alpha] with values 0-1.
 */
export type ColorConstructorArgs = [
  red: number,
  green: number,
  blue: number,
  alpha: number
];

/**
 * Type guard for ColorConstructorArgs.
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

export const isColorJson = (color: unknown): color is ColorJson =>
  !!color &&
  typeof color === "object" &&
  "red" in color &&
  "green" in color &&
  "blue" in color &&
  "alpha" in color &&
  typeof (color as ColorJson).red === "number" &&
  typeof (color as ColorJson).green === "number" &&
  typeof (color as ColorJson).blue === "number" &&
  typeof (color as ColorJson).alpha === "number";

/**
 * Convert Cesium Color to constructor args array.
 */
export const colorToConstructorArgs = (color: Color): ColorConstructorArgs => {
  const { red, green, blue, alpha } = color;
  return [red, green, blue, alpha];
};

/**
 * Convert constructor args array to Cesium Color.
 */
export const colorFromConstructorArgs = (color: unknown): Color | null => {
  if (!isColorConstructorArgs(color)) {
    console.debug("Invalid color array", color);
    return null;
  }
  const [red, green, blue, alpha] = color;
  return new Color(red, green, blue, alpha);
};

export const colorToJson = (color: Color): ColorJson => ({
  red: color.red,
  green: color.green,
  blue: color.blue,
  alpha: color.alpha,
});

export const colorFromJson = (color: unknown): Color | null => {
  if (!isColorJson(color)) {
    return null;
  }
  return new Color(color.red, color.green, color.blue, color.alpha);
};
