import { Ellipsoid } from "cesium";
export { Ellipsoid };

type DefinedEllipsoid = "WGS84" | "UNIT_SPHERE";

export const EllipsoidFromJSON = (str: DefinedEllipsoid): Ellipsoid => {
  switch (str) {
    case "WGS84":
      return Ellipsoid.WGS84;
    case "UNIT_SPHERE":
      return Ellipsoid.UNIT_SPHERE;
    default:
      console.warn(
        `EllipsoidFromJSON: Unknown ellipsoid ${str}, defaulting to WGS84`
      );
      return Ellipsoid.WGS84;
  }
};
