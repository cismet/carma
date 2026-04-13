import type { LatLngAlt } from "@carma-geo/data-structures";

import { Cartesian3, Cartographic } from "@carma-cesium";
import { getDegreesFromCartographic } from "./Conversions";
export const getDegreesFromCartesian = (
  cartesian: Cartesian3
): LatLngAlt.deg => {
  const cartographic = Cartographic.fromCartesian(cartesian);
  return getDegreesFromCartographic(cartographic);
};
