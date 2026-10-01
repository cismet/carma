import type { fitShadowMap } from "./fit-shadow-map";

type ShadowRaster = ReturnType<typeof fitShadowMap>;
type ReceiverBounds = Readonly<{
  left: number;
  right: number;
  bottom: number;
  top: number;
}>;

/** Reuse a world-aligned raster while it can contain every receiver plus
 * filtering and finite-sun guards. Recentring by whole texels preserves the
 * same world sample locations. Enlargements that exceed storage must refit;
 * newly exposed terrain must never be clipped to keep the old grid.
 */
export const retainShadowRaster = (
  previous: ShadowRaster | undefined,
  next: ShadowRaster,
  receivers: ReceiverBounds,
  sunDiscGuardMeters: number
): ShadowRaster => {
  if (!previous) return next;
  const guardX = sunDiscGuardMeters + previous.guardMetersX;
  const guardY = sunDiscGuardMeters + previous.guardMetersY;
  const contains = (raster: ShadowRaster) =>
    receivers.left - guardX >= raster.left &&
    receivers.right + guardX <= raster.right &&
    receivers.bottom - guardY >= raster.bottom &&
    receivers.top + guardY <= raster.top;
  if (contains(previous)) return previous;
  const width = previous.right - previous.left;
  const height = previous.top - previous.bottom;
  const centerX =
    Math.round(
      (receivers.left + receivers.right) / 2 / previous.metersPerTexelX
    ) * previous.metersPerTexelX;
  const centerY =
    Math.round(
      (receivers.bottom + receivers.top) / 2 / previous.metersPerTexelY
    ) * previous.metersPerTexelY;
  const recentered = {
    ...previous,
    left: centerX - width / 2,
    right: centerX + width / 2,
    bottom: centerY - height / 2,
    top: centerY + height / 2,
  };
  return contains(recentered) ? recentered : next;
};
