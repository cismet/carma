import { Vector3 } from "three";
import { Cartesian2, Cartesian3 } from "@carma-cesium";

import type { AnnotationScreenPosition } from "@carma-mapping/annotations/core";

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

/** Like `vector3FromCartesian3`, passing a missing value on as null. */
export const vector3FromOptionalCartesian3 = (
  cartesian: Cartesian3 | null | undefined
): Vector3 | null => (cartesian ? vector3FromCartesian3(cartesian) : null);

export const screenPositionFromCartesian2 = (
  position: Cartesian2
): AnnotationScreenPosition => ({ x: position.x, y: position.y });
