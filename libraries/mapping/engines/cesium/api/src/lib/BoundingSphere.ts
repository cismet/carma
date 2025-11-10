// Re-export BoundingSphere class from Cesium
import { BoundingSphere } from "cesium";
export { BoundingSphere };

export const isValidBoundingSphere = (
  sphere: unknown
): sphere is BoundingSphere => sphere instanceof BoundingSphere;
