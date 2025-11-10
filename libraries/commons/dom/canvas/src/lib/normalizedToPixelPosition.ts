import { Cartesian2 } from "cesium";
import type {
  CssPixelDimensions,
  CssPixelPosition,
  CssPixels,
} from "@carma/units/types";

/**
 * Convert normalized canvas coordinates [0..1] to window pixel coordinates.
 *
 * Returns both a branded CssPixelPosition and a Cartesian2 for Cesium APIs.
 *
 * @param canvasDimensions - Canvas dimensions in CSS pixels
 * @param position - Normalized position [x, y] where [0.5, 0.5] is center
 * @param pixelOffset - Subpixel offset [x, y] within each pixel (default: [0.5, 0.5] for center)
 * @returns Tuple of [CssPixelPosition, Cartesian2] - same values, different types
 *
 * @example
 * // Default: pixel-centered sampling
 * const dims = { width: 1920, height: 1080 };
 * const [cssPos, cartesian] = normalizedToPixelPosition(dims, [0.5, 0.5]);
 * // cssPos: { x: 959.5, y: 539.5 } (pixel center)
 *
 * @example
 * // Top-left corner of pixel (useful for edge testing)
 * const [corner] = normalizedToPixelPosition(dims, [0.5, 0.5], [0, 0]);
 * // corner: { x: 959.0, y: 539.0 }
 *
 * @example
 * // Jittered sampling for anti-aliasing
 * const [jittered] = normalizedToPixelPosition(dims, [0.5, 0.5], [Math.random(), Math.random()]);
 * // jittered: { x: 959.xxx, y: 539.xxx }
 */
export const normalizedToPixelPosition = (
  canvasDimensions: CssPixelDimensions,
  [x = 0.5, y = 0.5]: [number, number] = [0.5, 0.5],
  [offsetX = 0.5, offsetY = 0.5]: [number, number] = [0.5, 0.5]
): [CssPixelPosition, Cartesian2] => {
  const { width, height } = canvasDimensions;
  // Convert normalized [0..1] to pixel coordinates with configurable subpixel offset
  // offset=[0.5, 0.5] centers within pixel, [0, 0]=top-left corner, [1, 1]=bottom-right corner
  const xPos = (width - 1) * x + offsetX;
  const yPos = (height - 1) * y + offsetY;
  return [
    { x: xPos as CssPixels, y: yPos as CssPixels },
    new Cartesian2(xPos, yPos),
  ];
};
