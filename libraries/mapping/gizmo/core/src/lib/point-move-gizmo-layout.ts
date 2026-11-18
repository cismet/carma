import { clamp } from "@carma-commons/math";

/** Side length of the overlay handle box for the gizmo's `radius` option. */
export const getAxisUiLengthPx = (radius: number): number =>
  clamp(radius * 16, 72, 108);

export const getAxisArrowOffsetPx = (axisUiLengthPx: number): number =>
  Math.max(26, Math.round(axisUiLengthPx * 0.42));
