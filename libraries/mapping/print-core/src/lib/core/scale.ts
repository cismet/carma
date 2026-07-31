// Pure scale / bbox math shared by every engine preview.

import type { Orientation, ScaleOption } from "./types";

export const scaleOptions: ScaleOption[] = [
  { value: "250", label: "1 : 250" },
  { value: "500", label: "1 : 500" },
  { value: "1000", label: "1 : 1000" },
  { value: "2500", label: "1 : 2500" },
  { value: "5000", label: "1 : 5000" },
  { value: "10000", label: "1 : 10.000" },
  { value: "20000", label: "1 : 20.000" },
  { value: "40000", label: "1 : 40.000" },
  { value: "60000", label: "1 : 60.000" },
  { value: "100000", label: "1 : 100.000" },
  { value: "150000", label: "1 : 150.000" },
];

/** Printable map area in pixels for the A4 templates, per orientation. */
export const getPrintPixelSize = (orientation: Orientation) => ({
  width: orientation === "landscape" ? 802 : 555,
  height: orientation === "landscape" ? 555 : 802,
});

const degToRad = (degrees: number) => degrees * (Math.PI / 180);

/**
 * Web-Mercator distorts north-south; the nominal scale must be corrected by
 * the latitude so the printed scale bar is true to ground.
 */
export const getMercatorScale = (scale: number, lat: number): number =>
  scale * (1 / Math.cos(degToRad(lat)));

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Build a metric (EPSG:3857) bounding box around a center for the print area. */
export function calculateBBox(
  centerX: number,
  centerY: number,
  pixelWidth: number,
  pixelHeight: number,
  dpi: number,
  scale: number
): BBox {
  const metersPerPixel = (0.0254 / dpi) * scale;
  const halfWidth = (pixelWidth * metersPerPixel) / 2;
  const halfHeight = (pixelHeight * metersPerPixel) / 2;

  return {
    minX: centerX - halfWidth,
    maxX: centerX + halfWidth,
    minY: centerY - halfHeight,
    maxY: centerY + halfHeight,
  };
}

/**
 * Font size for the preview overlay text, by orientation and current pixel
 * width of the preview rectangle. Ported verbatim from the geoportal Leaflet
 * helper so both engines size the overlay identically.
 */
export const getPreviewFontSize = (
  orientation: Orientation,
  width: number
): string => {
  if (orientation === "portrait") {
    if (width >= 154 && width <= 278) return "16px";
    if (width >= 103 && width < 154) return "10px";
    if (width >= 80 && width < 103) return "7px";
    if (width < 80) return "0px";
    return "24px";
  }
  // landscape
  if (width >= 118 && width < 236) return "7px";
  if (width >= 236 && width < 474) return "16px";
  if (width >= 474) return "24px";
  return "0px";
};

/**
 * Whether the preview is small enough that the overlay collapses to its
 * compact ("small") layout. Thresholds match the geoportal helper.
 */
export const getPreviewIsSmallMode = (
  orientation: Orientation,
  width: number
): boolean =>
  orientation === "portrait" ? width <= 154 : width <= 278;

/** GeoJSON-ish polygon (EPSG:3857) from a bbox — used to seed the preview rect. */
export function createFeatureFromBBox(bbox: BBox) {
  return {
    type: "Polygon" as const,
    crs: { type: "name", properties: { name: "EPSG:3857" } },
    coordinates: [
      [
        [bbox.minX, bbox.minY],
        [bbox.maxX, bbox.minY],
        [bbox.maxX, bbox.maxY],
        [bbox.minX, bbox.maxY],
        [bbox.minX, bbox.minY],
      ],
    ],
  };
}
