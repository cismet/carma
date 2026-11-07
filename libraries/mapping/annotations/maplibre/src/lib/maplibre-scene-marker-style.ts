import type { AnnotationSceneMarkerStyle } from "@carma-mapping/annotations/core";

import { parseCssColor } from "./maplibre-css-color";

/** One marker as the instance attributes of the marker material read it; sizes in CSS pixels. */
export type PackedSceneMarkerStyle = {
  /** Outer radius, half the straight length of a bar, outline width, ring width. */
  shape: readonly [number, number, number, number];
  /** Linear rgb and alpha. */
  fill: readonly [number, number, number, number];
  outline: readonly [number, number, number, number];
  ring: readonly [number, number, number, number];
  /** Ring fades out (1) or is hard (0), occluded look (1), opacity of the whole marker. */
  look: readonly [number, number, number];
};

const packColor = (css: string) => {
  const { color, opacity } = parseCssColor(css);
  return [color.r, color.g, color.b, opacity] as const;
};

const nonNegative = (value: number | undefined) =>
  Number.isFinite(value) ? Math.max(0, value as number) : 0;

const unitOpacity = (value: number | undefined) =>
  value === undefined ? 1 : Math.min(1, nonNegative(value));

/**
 * Resolves a marker style the way the DOM draws it: `sizePx` is the outer
 * diameter (outline inside it, `box-sizing: border-box`), a bar of
 * `barLengthPx` is a stadium of that total length, `scale` grows
 * everything including the ring, like a CSS transform, and `opacity` fades
 * the composed marker like CSS `opacity`.
 */
export const packSceneMarkerStyle = (
  style: AnnotationSceneMarkerStyle
): PackedSceneMarkerStyle => {
  const scale = style.scale !== undefined ? nonNegative(style.scale) : 1;
  const thickness = nonNegative(style.sizePx) * scale;
  const radius = thickness / 2;
  const barLength = nonNegative(style.barLengthPx) * scale;
  return {
    shape: [
      radius,
      Math.max(0, barLength - thickness) / 2,
      Math.min(nonNegative(style.outlineWidthPx) * scale, radius),
      nonNegative(style.ring?.widthPx) * scale,
    ],
    fill: packColor(style.fill),
    outline: packColor(style.outline),
    ring: style.ring ? packColor(style.ring.color) : [0, 0, 0, 0],
    look: [
      style.ring?.soft ? 1 : 0,
      style.occluded ? 1 : 0,
      unitOpacity(style.opacity),
    ],
  };
};
