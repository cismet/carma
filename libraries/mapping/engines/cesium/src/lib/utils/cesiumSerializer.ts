import { Cartesian3, Color } from "cesium";
import type { ColorRgbaArray, PlainCartesian3 } from "@carma-commons/types";

export const toPlainCartesian3 = (cartesian3: Cartesian3): PlainCartesian3 => {
  return { x: cartesian3.x, y: cartesian3.y, z: cartesian3.z };
};

export const fromPlainCartesian3 = ({
  x,
  y,
  z,
}: PlainCartesian3): Cartesian3 => {
  return new Cartesian3(x, y, z);
};

export const isColorRgbaArray = (color: unknown): color is ColorRgbaArray => {
  return (
    Array.isArray(color) &&
    color.length === 4 &&
    color.every((x) => typeof x === "number")
  );
};

export const toColorRgbaArray = (color: Color): ColorRgbaArray => {
  const { red, green, blue, alpha } = color;
  return [red, green, blue, alpha];
};

export const fromColorRgbaArray = (color: unknown): Color | null => {
  if (!isColorRgbaArray(color)) {
    console.debug("Invalid color array", color);
    return null;
  }
  const [red, green, blue, alpha] = color;
  return new Color(red, green, blue, alpha);
};
