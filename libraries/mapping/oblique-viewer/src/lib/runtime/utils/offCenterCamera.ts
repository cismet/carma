import type { Map as MaplibreMap, PaddingOptions } from "maplibre-gl";

/** Shift the perspective centre in CSS pixels, preserving the shared edge inset. */
export const paddingForCenterOffset = (
  map: MaplibreMap,
  offset: { x: number; y: number }
): PaddingOptions => {
  const { width, height } = map.transform;
  const padding = map.getPadding();
  const x = Math.max(-width / 2, Math.min(width / 2, offset.x));
  const y = Math.max(-height / 2, Math.min(height / 2, offset.y));
  const horizontal = Math.min(padding.left, padding.right);
  const vertical = Math.min(padding.top, padding.bottom);
  return {
    left: horizontal + Math.max(0, 2 * x),
    right: horizontal + Math.max(0, -2 * x),
    top: vertical + Math.max(0, 2 * y),
    bottom: vertical + Math.max(0, -2 * y),
  };
};
