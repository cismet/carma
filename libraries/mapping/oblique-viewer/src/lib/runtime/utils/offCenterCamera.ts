import type { Map as MaplibreMap, PaddingOptions } from "maplibre-gl";
import type { CssPixels } from "@carma-units";

/** Shift the perspective centre in CSS pixels, preserving the shared edge inset. */
export const paddingForCenterOffset = (
  map: MaplibreMap,
  offset: { x: CssPixels; y: CssPixels }
): PaddingOptions => {
  const padding = map.getPadding();
  const { x, y } = offset;
  const horizontal = Math.min(padding.left ?? 0, padding.right ?? 0);
  const vertical = Math.min(padding.top ?? 0, padding.bottom ?? 0);
  return {
    left: horizontal + Math.max(0, 2 * x),
    right: horizontal + Math.max(0, -2 * x),
    top: vertical + Math.max(0, 2 * y),
    bottom: vertical + Math.max(0, -2 * y),
  };
};
