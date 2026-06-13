import type { RuntimePointLabelRenderModel } from "../render/annotation-render-models";

import { typographyDefaults } from "./annotation-typography-defaults";
import { ANNOTATION_DEFAULT_LABEL_THEME } from "./annotation-label-themes";
import { annotationVisualDefaults } from "./annotation-visual-defaults";

export const pointLabelVisualDefaults = Object.freeze({
  fontSize: typographyDefaults.rootFontSizeRem,
  fontFamily: ANNOTATION_DEFAULT_LABEL_THEME.fontFamily,
  fontWeight: ANNOTATION_DEFAULT_LABEL_THEME.contentFontWeight,
  lineColor: ANNOTATION_DEFAULT_LABEL_THEME.scheme.lineColor,
  textBackgroundColor:
    ANNOTATION_DEFAULT_LABEL_THEME.scheme.colorPrimaryReduced,
  textColor: ANNOTATION_DEFAULT_LABEL_THEME.scheme.textColor,
  markerBackgroundColor:
    ANNOTATION_DEFAULT_LABEL_THEME.scheme.colorPrimary,
  markerTextColor: ANNOTATION_DEFAULT_LABEL_THEME.scheme.textColor,
  selectedBackgroundColor:
    ANNOTATION_DEFAULT_LABEL_THEME.selection.backgroundColor,
  selectedTextColor:
    ANNOTATION_DEFAULT_LABEL_THEME.selection.textColor,
  selectedGlowColor:
    ANNOTATION_DEFAULT_LABEL_THEME.selection.glowColor,
  selectedGlowRadiusPx:
    ANNOTATION_DEFAULT_LABEL_THEME.selection.glowRadiusPx,
  preserveFillOnSelection:
    ANNOTATION_DEFAULT_LABEL_THEME.selection
      .preserveFillOnSelection,
  hoverBackgroundColor:
    ANNOTATION_DEFAULT_LABEL_THEME.selection.hoverBackgroundColor,
  markerPixelSize: annotationVisualDefaults.sizes.pointPixelSize,
  markerOutlineWidth: annotationVisualDefaults.sizes.pointOutlineWidth,
} satisfies Pick<RuntimePointLabelRenderModel, "fontSize" | "fontFamily" | "fontWeight" | "lineColor" | "textBackgroundColor" | "textColor" | "markerBackgroundColor" | "markerTextColor" | "selectedBackgroundColor" | "selectedTextColor" | "selectedGlowColor" | "selectedGlowRadiusPx" | "preserveFillOnSelection" | "hoverBackgroundColor" | "markerPixelSize" | "markerOutlineWidth">);

export const resolvePointLabelVisualDefaults = (
  label: RuntimePointLabelRenderModel
): RuntimePointLabelRenderModel => ({
  ...label,
  fontSize: label.fontSize ?? pointLabelVisualDefaults.fontSize,
  fontFamily: label.fontFamily ?? pointLabelVisualDefaults.fontFamily,
  fontWeight: label.fontWeight ?? pointLabelVisualDefaults.fontWeight,
  lineColor: label.lineColor ?? pointLabelVisualDefaults.lineColor,
  textBackgroundColor:
    label.textBackgroundColor ?? pointLabelVisualDefaults.textBackgroundColor,
  textColor: label.textColor ?? pointLabelVisualDefaults.textColor,
  markerBackgroundColor:
    label.markerBackgroundColor ??
    pointLabelVisualDefaults.markerBackgroundColor,
  markerTextColor:
    label.markerTextColor ?? pointLabelVisualDefaults.markerTextColor,
  selectedBackgroundColor:
    label.selectedBackgroundColor ??
    pointLabelVisualDefaults.selectedBackgroundColor,
  selectedTextColor:
    label.selectedTextColor ?? pointLabelVisualDefaults.selectedTextColor,
  selectedGlowColor:
    label.selectedGlowColor ?? pointLabelVisualDefaults.selectedGlowColor,
  selectedGlowRadiusPx:
    label.selectedGlowRadiusPx ?? pointLabelVisualDefaults.selectedGlowRadiusPx,
  preserveFillOnSelection:
    label.preserveFillOnSelection ??
    pointLabelVisualDefaults.preserveFillOnSelection,
  hoverBackgroundColor:
    label.hoverBackgroundColor ?? pointLabelVisualDefaults.hoverBackgroundColor,
  markerPixelSize:
    label.markerPixelSize ?? pointLabelVisualDefaults.markerPixelSize,
  markerOutlineWidth:
    label.markerOutlineWidth ?? pointLabelVisualDefaults.markerOutlineWidth,
});
