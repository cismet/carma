import { BoundingSphere, Cartesian3 } from "@carma/cesium";

export const getBoundingSphereFromCoordinates = (
  coordinates: number[][]
): BoundingSphere => {
  const points = coordinates.map((coord) =>
    Cartesian3.fromDegrees(coord[0], coord[1], coord[2] ?? 0)
  );
  return BoundingSphere.fromPoints(points);
};
