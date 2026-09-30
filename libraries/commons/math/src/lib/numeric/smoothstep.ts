import { clamp } from "./clamp";

/** Cubic transition from 0 to 1 with flat ends; requires edge0 < edge1. */
export const smoothstep = (
  edge0: number,
  edge1: number,
  value: number
): number => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
