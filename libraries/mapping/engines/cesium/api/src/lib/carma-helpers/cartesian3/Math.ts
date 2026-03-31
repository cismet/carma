import type { Meters } from "@carma/units/types";

import { Cartesian3 } from "../../cesium";
/**
 * Calculate distance between two Cartesian3 points.
 */
export const cartesian3Distance = (
  cartesian1: Cartesian3,
  cartesian2: Cartesian3
): Meters => Cartesian3.distance(cartesian1, cartesian2) as Meters;

/**
 * Apply a constant offset to a list of Cartesian3 positions.
 */
export const offsetCartesian3Positions = (
  positions: readonly Cartesian3[],
  offset: Cartesian3
): Cartesian3[] =>
  positions.map((position) =>
    Cartesian3.add(position, offset, new Cartesian3())
  );
