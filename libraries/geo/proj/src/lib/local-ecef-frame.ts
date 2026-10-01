import { Matrix4 } from "three";
import { degToRadNumeric } from "@carma-units";
import { cartographicToEcef, ecefToEnuMatrix } from "./geodetic";

/** RTC frame: metres east/up/south, with an explicit transform to EPSG:4978. */
export const createLocalEcefFrame = (
  longitudeDegrees: number,
  latitudeDegrees: number,
  heightMeters = 0
) => {
  const origin = cartographicToEcef(
    degToRadNumeric(longitudeDegrees),
    degToRadNumeric(latitudeDegrees),
    heightMeters
  );
  const enu = ecefToEnuMatrix(origin).elements;
  const localFromEcef = new Matrix4().set(
    enu[0],
    enu[4],
    enu[8],
    enu[12],
    enu[2],
    enu[6],
    enu[10],
    enu[14],
    -enu[1],
    -enu[5],
    -enu[9],
    -enu[13],
    0,
    0,
    0,
    1
  );
  return {
    origin,
    localFromEcef,
    ecefFromLocal: localFromEcef.clone().invert(),
  };
};
