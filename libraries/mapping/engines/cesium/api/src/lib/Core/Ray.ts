// Re-export Ray class from Cesium
import { Ray } from "cesium";
export { Ray };

export const isValidRay = (ray: unknown): ray is Ray => {
  return ray instanceof Ray;
};
