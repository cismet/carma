import { Cartesian3, Color } from "@carma-cesium";

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

export const colorFromRgbaArray = (color: ColorConstructorArgs): Color =>
  new Color(...color);

export const cloneColor = (color: Color): Color =>
  Color.clone(color, new Color());

export const colorToRgbCartesian3 = (color: Color): Cartesian3 =>
  new Cartesian3(color.red, color.green, color.blue);

/**
 * Convert constructor args array to Cesium Color.
 */
export const colorFromConstructorArgs = (color: unknown): Color | null => {
  if (!isColorConstructorArgs(color)) {
    console.debug("Invalid color array", color);
    return null;
  }
  return colorFromRgbaArray(color);
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
