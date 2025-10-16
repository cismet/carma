import { Cartesian3 } from "cesium";

export const cartesian3Distance = (
  cartesian1: Cartesian3,
  cartesian2: Cartesian3
): number => {
  return Cartesian3.distance(cartesian1, cartesian2);
};
