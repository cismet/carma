import { POINT_LABEL_STYLE } from "@carma-providers/label-overlay";
import type {
  AnnotationAreaPalette,
  AnnotationGeographicCoordinate,
  PolygonType,
} from "@carma-mapping/annotations/core";
import {
  RUNTIME_AREA_LABEL_FIT_ROLE,
  type RuntimePointLabelRenderModel,
} from "@carma-mapping/annotations/runtime";

/**
 * The pill an area value turns into once it no longer fits inside its area
 * on screen: the label tool's pill on a stem from the area centroid, in the
 * area's colour with the white text of the inside label, and a drop shadow
 * that keeps the white readable on the bright fills.
 */
const AREA_LABEL_PILL_ALPHA = 0.94;
const AREA_LABEL_PILL_TEXT = "rgba(255, 255, 255, 0.98)";
export const AREA_LABEL_PILL_TEXT_SHADOW =
  "0 0 2px rgba(0, 0, 0, 0.75), 0 1px 3px rgba(0, 0, 0, 0.55)";

export const resolveAreaLabelPillColors = (
  palette: AnnotationAreaPalette,
  type: PolygonType
): { background: string; text: string } => ({
  background: palette.cssColor(type, AREA_LABEL_PILL_ALPHA),
  text: AREA_LABEL_PILL_TEXT,
});

/** Point label fields for an area value pill in these colours. */
export const createAreaLabelPillStyle = (colors: {
  background: string;
  text: string;
}) => ({
  textBackgroundColor: colors.background,
  textColor: colors.text,
  markerBackgroundColor: colors.background,
  markerTextColor: colors.text,
  selectedBackgroundColor: colors.background,
  selectedTextColor: colors.text,
  preserveFillOnSelection: true,
  hoverBackgroundColor: colors.background,
  textShadow: AREA_LABEL_PILL_TEXT_SHADOW,
  labelStyle: POINT_LABEL_STYLE.AUTO,
  hideMarker: true,
  collapse: false,
});

/**
 * The inside text of an area value and its pill twin: the label visualizer
 * shows the text while it fits inside the projected area and the pill, on a
 * stem from the area centroid, once it does not.
 */
export const pairAreaValueLabelWithPill = (
  insideLabel: RuntimePointLabelRenderModel,
  {
    outline,
    pillColors,
  }: {
    outline: readonly AnnotationGeographicCoordinate[];
    pillColors: { background: string; text: string };
  }
): RuntimePointLabelRenderModel[] => {
  const key = insideLabel.id;
  return [
    {
      ...insideLabel,
      areaFit: { key, role: RUNTIME_AREA_LABEL_FIT_ROLE.INSIDE, outline },
    },
    {
      ...createAreaLabelPillStyle(pillColors),
      id: `${insideLabel.id}-pill`,
      annotationId: insideLabel.annotationId,
      // no node: the pill hangs from the area centroid and stays while a
      // corner is edited
      coordinate: insideLabel.coordinate,
      content: insideLabel.content,
      // with badge content the label overlay draws the capsule, as for the
      // label tool's pills
      badgeContent: insideLabel.content,
      selected: insideLabel.selected,
      onClick: insideLabel.onClick,
      onLongPress: insideLabel.onLongPress,
      areaFit: { key, role: RUNTIME_AREA_LABEL_FIT_ROLE.OUTSIDE, outline },
    },
  ];
};
