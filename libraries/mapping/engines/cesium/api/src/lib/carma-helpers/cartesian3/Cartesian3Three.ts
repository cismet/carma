import { Cartesian3 } from "../../cesium";
import { Vector3 } from "@carma/math";

export const cartesian3ToVector3 = (value: Cartesian3): Vector3 =>
  new Vector3(value.x, value.y, value.z);
