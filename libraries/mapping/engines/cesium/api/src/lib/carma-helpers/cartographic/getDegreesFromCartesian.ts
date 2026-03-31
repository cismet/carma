import { Cartesian3, Cartographic } from "../../cesium";
import type { LatLngAlt } from "@carma/geo/types";
import { getDegreesFromCartographic } from "./Conversions";

export const getDegreesFromCartesian = (
  cartesian: Cartesian3
): LatLngAlt.deg => {
  const cartographic = Cartographic.fromCartesian(cartesian);
  return getDegreesFromCartographic(cartographic);
};
