import { BoundingSphere, Cartesian3 } from "../../cesium";

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
