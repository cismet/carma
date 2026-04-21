import type { RuntimePointLabelRenderModel } from "../render/measurement-render-models";

import { typographyDefaults } from "./annotation-typography-defaults";
import { ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME } from "./annotation-measurement-label-themes";
import { measurementVisualDefaults } from "./measurement-visual-defaults";

export const pointLabelVisualDefaults = Object.freeze({
  fontSize: typographyDefaults.rootFontSizeRem,
  fontFamily: ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME.fontFamily,
  fontWeight: ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME.contentFontWeight,
  lineColor: ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME.scheme.lineColor,
  textBackgroundColor:
    ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME.scheme.colorPrimaryReduced,
  textColor: ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME.scheme.textColor,
  markerBackgroundColor:
    ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME.scheme.colorPrimary,
  markerTextColor: ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME.scheme.textColor,
  selectedBackgroundColor:
    ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME.selection.backgroundColor,
  selectedTextColor:
    ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME.selection.textColor,
  selectedGlowColor:
    ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME.selection.glowColor,
  selectedGlowRadiusPx:
    ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME.selection.glowRadiusPx,
  preserveFillOnSelection:
    ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME.selection
      .preserveFillOnSelection,
  hoverBackgroundColor:
    ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME.selection.hoverBackgroundColor,
  markerPixelSize: measurementVisualDefaults.sizes.pointPixelSize,
  markerOutlineWidth: measurementVisualDefaults.sizes.pointOutlineWidth,
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
    label.markerBackgroundColor ?? pointLabelVisualDefaults.markerBackgroundColor,
  markerTextColor:
    label.markerTextColor ?? pointLabelVisualDefaults.markerTextColor,
  selectedBackgroundColor:
    label.selectedBackgroundColor ?? pointLabelVisualDefaults.selectedBackgroundColor,
  selectedTextColor:
    label.selectedTextColor ?? pointLabelVisualDefaults.selectedTextColor,
  selectedGlowColor:
    label.selectedGlowColor ?? pointLabelVisualDefaults.selectedGlowColor,
  selectedGlowRadiusPx:
    label.selectedGlowRadiusPx ?? pointLabelVisualDefaults.selectedGlowRadiusPx,
  preserveFillOnSelection:
    label.preserveFillOnSelection ?? pointLabelVisualDefaults.preserveFillOnSelection,
  hoverBackgroundColor:
    label.hoverBackgroundColor ?? pointLabelVisualDefaults.hoverBackgroundColor,
  markerPixelSize:
    label.markerPixelSize ?? pointLabelVisualDefaults.markerPixelSize,
  markerOutlineWidth:
    label.markerOutlineWidth ?? pointLabelVisualDefaults.markerOutlineWidth,
});
