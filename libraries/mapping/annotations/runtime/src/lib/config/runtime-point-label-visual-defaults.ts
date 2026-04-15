import type { RuntimePointLabelRenderModel } from "../render/measurement-render-models";

import { annotationTypographyDefaults } from "./annotation-typography-defaults";
import { ANNOTATION_MEASUREMENT_DEFAULT_LABEL_THEME } from "./annotation-measurement-label-themes";
import { runtimeMeasurementVisualDefaults } from "./measurement-visual-defaults";

export const runtimePointLabelVisualDefaults = Object.freeze({
  fontSize: annotationTypographyDefaults.rootFontSizeRem,
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
  markerPixelSize: runtimeMeasurementVisualDefaults.sizes.pointPixelSize,
  markerOutlineWidth: runtimeMeasurementVisualDefaults.sizes.pointOutlineWidth,
} satisfies Pick<RuntimePointLabelRenderModel, "fontSize" | "fontFamily" | "fontWeight" | "lineColor" | "textBackgroundColor" | "textColor" | "markerBackgroundColor" | "markerTextColor" | "selectedBackgroundColor" | "selectedTextColor" | "selectedGlowColor" | "selectedGlowRadiusPx" | "preserveFillOnSelection" | "hoverBackgroundColor" | "markerPixelSize" | "markerOutlineWidth">);

export const resolveRuntimePointLabelVisualDefaults = (
  label: RuntimePointLabelRenderModel
): RuntimePointLabelRenderModel => ({
  ...label,
  fontSize: label.fontSize ?? runtimePointLabelVisualDefaults.fontSize,
  fontFamily: label.fontFamily ?? runtimePointLabelVisualDefaults.fontFamily,
  fontWeight: label.fontWeight ?? runtimePointLabelVisualDefaults.fontWeight,
  lineColor: label.lineColor ?? runtimePointLabelVisualDefaults.lineColor,
  textBackgroundColor:
    label.textBackgroundColor ??
    runtimePointLabelVisualDefaults.textBackgroundColor,
  textColor: label.textColor ?? runtimePointLabelVisualDefaults.textColor,
  markerBackgroundColor:
    label.markerBackgroundColor ??
    runtimePointLabelVisualDefaults.markerBackgroundColor,
  markerTextColor:
    label.markerTextColor ?? runtimePointLabelVisualDefaults.markerTextColor,
  selectedBackgroundColor:
    label.selectedBackgroundColor ??
    runtimePointLabelVisualDefaults.selectedBackgroundColor,
  selectedTextColor:
    label.selectedTextColor ??
    runtimePointLabelVisualDefaults.selectedTextColor,
  selectedGlowColor:
    label.selectedGlowColor ??
    runtimePointLabelVisualDefaults.selectedGlowColor,
  selectedGlowRadiusPx:
    label.selectedGlowRadiusPx ??
    runtimePointLabelVisualDefaults.selectedGlowRadiusPx,
  preserveFillOnSelection:
    label.preserveFillOnSelection ??
    runtimePointLabelVisualDefaults.preserveFillOnSelection,
  hoverBackgroundColor:
    label.hoverBackgroundColor ??
    runtimePointLabelVisualDefaults.hoverBackgroundColor,
  markerPixelSize:
    label.markerPixelSize ?? runtimePointLabelVisualDefaults.markerPixelSize,
  markerOutlineWidth:
    label.markerOutlineWidth ??
    runtimePointLabelVisualDefaults.markerOutlineWidth,
});
