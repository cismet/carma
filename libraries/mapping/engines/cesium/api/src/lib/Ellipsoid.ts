import { Ellipsoid } from "cesium";
export { Ellipsoid };

export type EllipsoidPrimitive = Pick<Ellipsoid, "radii">;

export const EllipsoidRadiiWGS84 = [6378137.0, 6378137.0, 6356752.3142451793];
