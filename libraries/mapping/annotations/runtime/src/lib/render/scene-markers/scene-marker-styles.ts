import { labelOverlayAffordanceDefaults } from "@carma-providers/label-overlay";

import type { AnnotationSceneMarkerStyle } from "@carma-mapping/annotations/core";

/**
 * The DOM looks of the markers and handles as scene marker styles, so both
 * engines draw the same: sizes, colours, the hover scale and ring of the
 * overlay affordances, the soft shadow of a label's node marker.
 */

export type SceneMarkerStyles = {
  style: AnnotationSceneMarkerStyle;
  hoverStyle?: AnnotationSceneMarkerStyle;
};

const TRANSPARENT = "transparent";

/** Hover in the overlay: scaled up with a faint spread ring (`buildOverlayRingBoxShadowCss`). */
export const withSceneMarkerHover = (
  style: AnnotationSceneMarkerStyle
): AnnotationSceneMarkerStyle => ({
  ...style,
  scale: labelOverlayAffordanceDefaults.hover.scale,
  ring: {
    widthPx: labelOverlayAffordanceDefaults.hover.ringSpreadPx,
    color: labelOverlayAffordanceDefaults.colors.hoverRing,
  },
});

/** A standalone node marker (`PointMarkerOverlayShell`): its fill inside its outline. */
export const resolvePointMarkerSceneStyles = (point: {
  pixelSize: number;
  fill: string;
  outline: string;
  outlineWidth: number;
}): SceneMarkerStyles => {
  const style: AnnotationSceneMarkerStyle = {
    sizePx: point.pixelSize,
    fill: point.fill,
    outline: point.outline,
    outlineWidthPx: point.outlineWidth,
  };
  return { style, hoverStyle: withSceneMarkerHover(style) };
};

/**
 * The node marker a point label draws itself (`PointLabel`): a ring in the
 * marker border colour, the selection colour while selected, with the soft
 * shadow of `nodeMarkerBaseStyles`; it has no hover look.
 */
export const resolveLabelMarkerSceneStyle = (label: {
  markerSize: number;
  markerStrokeWidth: number;
  selected?: boolean;
  selectedGlowColor?: string;
  selectedTextColor?: string;
}): AnnotationSceneMarkerStyle => ({
  sizePx: label.markerSize,
  fill: TRANSPARENT,
  outline: label.selected
    ? label.selectedGlowColor ??
      label.selectedTextColor ??
      labelOverlayAffordanceDefaults.colors.surfaceMax
    : labelOverlayAffordanceDefaults.colors.surfaceMax,
  outlineWidthPx: label.markerStrokeWidth,
  ring: {
    widthPx: labelOverlayAffordanceDefaults.shadow.markerBlurRadiusPx,
    color: labelOverlayAffordanceDefaults.colors.shadowSoft,
    soft: true,
  },
});

/** The insert tick at an edge midpoint: a rounded bar across the edge. */
export const resolveInsertTickSceneStyles = (tick: {
  tickLengthPx: number;
  tickWidthPx: number;
  tickColor: string;
}): SceneMarkerStyles => {
  const style: AnnotationSceneMarkerStyle = {
    sizePx: tick.tickWidthPx,
    barLengthPx: tick.tickLengthPx,
    fill: tick.tickColor,
    outline: TRANSPARENT,
    outlineWidthPx: 0,
  };
  return { style, hoverStyle: withSceneMarkerHover(style) };
};

/** A plain dot, e.g. the centre of the distance corner handle. */
export const resolveDotSceneStyle = (
  diameterPx: number,
  color: string
): AnnotationSceneMarkerStyle => ({
  sizePx: diameterPx,
  fill: color,
  outline: TRANSPARENT,
  outlineWidthPx: 0,
});
