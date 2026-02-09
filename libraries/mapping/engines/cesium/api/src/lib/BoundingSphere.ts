// Re-export BoundingSphere class from Cesium
import { BoundingSphere, Cartesian3 } from "cesium";
export { BoundingSphere };

export const isValidBoundingSphere = (
  sphere: unknown
): sphere is BoundingSphere => sphere instanceof BoundingSphere;

export type BoundingSphereFromCoordinatesOptions = {
  defaultHeight?: number;
};

export const getBoundingSphereFromCoordinates = (
  coordinates: number[][],
  options: BoundingSphereFromCoordinatesOptions = {}
): BoundingSphere => {
  const { defaultHeight = 0 } = options;
  const points = coordinates.map((coord) =>
    Cartesian3.fromDegrees(coord[0], coord[1], coord[2] ?? defaultHeight)
  );
  return BoundingSphere.fromPoints(points);
};
