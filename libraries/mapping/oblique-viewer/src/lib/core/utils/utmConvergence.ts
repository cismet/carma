import { degToRadNumeric } from "@carma-units";

/** First-order grid/true-north convergence for the explicitly supported UTM32 frame. */
export const calculateUTMConvergence = (
  longitude: number,
  latitude: number
): number =>
  degToRadNumeric(longitude - 9) * Math.sin(degToRadNumeric(latitude));
