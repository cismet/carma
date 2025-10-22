/**
 * Validators for basic Cesium primitive types
 *
 * These validators check basic primitive types (Cartesian3, Color, Rectangle)
 * using property checks to avoid importing Cesium classes.
 *
 * **For complex types (Frustum, etc.):**
 * Use dynamic imports from @carma/cesium/api type guards instead:
 * ```typescript
 * const { isPerspectiveFrustum } = await import("@carma/cesium");
 * if (isPerspectiveFrustum(frustum)) { ... }
 * ```
 *
 * @module validators
 */

import type {
  Cartesian3Primitive,
  ColorPrimitive,
  RectanglePrimitive,
} from "@carma/cesium";

/**
 * Check if an object is a Cartesian3 primitive (has x, y, z properties)
 * @param obj - The object to check
 * @returns true if the object matches Cartesian3Primitive shape
 */
export const isCartesian3Primitive = (
  obj: unknown
): obj is Cartesian3Primitive => {
  const candidate = obj as Record<string, unknown>;
  return (
    typeof candidate?.x === "number" &&
    typeof candidate?.y === "number" &&
    typeof candidate?.z === "number"
  );
};

/**
 * Check if an object is a Color primitive (has red, green, blue, alpha properties)
 * @param obj - The object to check
 * @returns true if the object matches ColorPrimitive shape
 */
export const isColorPrimitive = (obj: unknown): obj is ColorPrimitive => {
  const candidate = obj as Record<string, unknown>;
  return (
    typeof candidate?.red === "number" &&
    typeof candidate?.green === "number" &&
    typeof candidate?.blue === "number" &&
    typeof candidate?.alpha === "number"
  );
};

/**
 * Check if an object is a Rectangle primitive (has west, south, east, north properties)
 * @param obj - The object to check
 * @returns true if the object matches RectanglePrimitive shape
 */
export const isRectanglePrimitive = (
  obj: unknown
): obj is RectanglePrimitive => {
  const candidate = obj as Record<string, unknown>;
  return (
    typeof candidate?.west === "number" &&
    typeof candidate?.south === "number" &&
    typeof candidate?.east === "number" &&
    typeof candidate?.north === "number"
  );
};
