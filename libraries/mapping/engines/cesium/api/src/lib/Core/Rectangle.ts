// Re-export Rectangle class from Cesium
import { Rectangle } from "cesium";
export { Rectangle };

/**
 * Plain object representation of a Rectangle with degrees
 * Suitable for JSON serialization
 */
export interface RectangleLike {
  west: number;
  south: number;
  east: number;
  north: number;
}

/**
 * Type guard to check if an object is RectangleLike
 */
export const isRectangleLike = (obj: unknown): obj is RectangleLike => {
  return (
    obj !== null &&
    typeof obj === "object" &&
    "west" in obj &&
    "south" in obj &&
    "east" in obj &&
    "north" in obj &&
    typeof obj.west === "number" &&
    typeof obj.south === "number" &&
    typeof obj.east === "number" &&
    typeof obj.north === "number"
  );
};

/**
 * Convert a RectangleLike plain object to a Cesium Rectangle instance
 */
export const rectangleFromLike = (rect: RectangleLike): Rectangle => {
  return Rectangle.fromDegrees(rect.west, rect.south, rect.east, rect.north);
};

/**
 * Convert a Cesium Rectangle to a plain RectangleLike object
 */
export const rectangleToLike = (rect: Rectangle): RectangleLike => {
  return {
    west: rect.west,
    south: rect.south,
    east: rect.east,
    north: rect.north,
  };
};

/**
 * Convert a config rectangle (plain object or undefined) to a Cesium Rectangle
 */
export const rectangleFromConfig = (
  config?: RectangleLike
): Rectangle | undefined => {
  return config ? rectangleFromLike(config) : undefined;
};
