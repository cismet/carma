import { Vector3 } from "three";

import { Cartesian3 } from "@carma-cesium";

export const cartesian3ToVector3 = (
  value: Cartesian3,
  out: Vector3 = new Vector3()
): Vector3 => out.set(value.x, value.y, value.z);

export const cartesian3FromVector3 = (
  value: Vector3,
  out: Cartesian3 = new Cartesian3()
): Cartesian3 => Cartesian3.fromElements(value.x, value.y, value.z, out);
