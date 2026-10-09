import { Vector3 } from "three";
import { Cartesian2, Cartesian3 } from "@carma-cesium";

import type { AnnotationScreenPosition } from "@carma-mapping/annotations/runtime";

/** ECEF `Vector3` (runtime carrier) to Cesium `Cartesian3`. */
export const cartesian3FromVector3 = (
  vector: Vector3,
  out: Cartesian3 = new Cartesian3()
): Cartesian3 => Cartesian3.fromElements(vector.x, vector.y, vector.z, out);

/** Cesium `Cartesian3` to the runtime's ECEF `Vector3`. */
export const vector3FromCartesian3 = (
  cartesian: Cartesian3,
  out: Vector3 = new Vector3()
): Vector3 => out.set(cartesian.x, cartesian.y, cartesian.z);

export const cartesian2FromScreenPosition = (
  position: AnnotationScreenPosition,
  out: Cartesian2 = new Cartesian2()
): Cartesian2 => Cartesian2.fromElements(position.x, position.y, out);
