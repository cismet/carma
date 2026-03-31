import { Vector3 } from "three";

import { Cartesian3 } from "../../cesium";
export const cartesian3ToVector3 = (value: Cartesian3): Vector3 =>
  new Vector3(value.x, value.y, value.z);
