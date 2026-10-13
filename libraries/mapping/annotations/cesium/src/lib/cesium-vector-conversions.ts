import type { Vector3 } from "three";
import { Cartesian2, type Cartesian3 } from "@carma-cesium";
import { cartesian3ToVector3 } from "@carma-mapping/engines/cesium/core";
import type { AnnotationScreenPosition } from "@carma-mapping/annotations/core";

export const cartesian2FromScreenPosition = (
  position: AnnotationScreenPosition,
  out: Cartesian2 = new Cartesian2()
): Cartesian2 => Cartesian2.fromElements(position.x, position.y, out);

/** Converts a possibly missing Cartesian3, passing a missing value on as null. */
export const vector3FromOptionalCartesian3 = (
  cartesian: Cartesian3 | null | undefined
): Vector3 | null => (cartesian ? cartesian3ToVector3(cartesian) : null);

export const screenPositionFromCartesian2 = (
  position: Cartesian2
): AnnotationScreenPosition => ({ x: position.x, y: position.y });
