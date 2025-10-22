import type { Color } from "cesium";

/**
 * Color with red, green, blue, and alpha components
 * @remarks All values are in range 0-1 (unit values)
 */
export type ColorPrimitive = Pick<Color, "red" | "green" | "blue" | "alpha">;

/**
 * Color constructor arguments: [red, green, blue, alpha]
 * @remarks All values are in range 0-1 (unit values)
 */
export type ColorConstructor = [number, number, number, number];
