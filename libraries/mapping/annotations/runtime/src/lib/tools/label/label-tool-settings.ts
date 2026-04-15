import {
  runtimeMeasurementVisualDefaults,
  type RuntimePointMarkerVisualStyle,
} from "../../config/measurement-visual-defaults";

export type LabelToolVisualSettings = {
  point: RuntimePointMarkerVisualStyle;
  selectedPoint: RuntimePointMarkerVisualStyle;
};

export type LabelToolSettings = {
  visuals: LabelToolVisualSettings;
};

const defaults = runtimeMeasurementVisualDefaults;

export const createLabelToolSettings = (_badgeStyle: {
  backgroundColor: string;
  textColor: string;
}): LabelToolSettings => ({
  visuals: {
    point: {
      pixelSize: 6,
      fill: defaults.colors.transparent,
      outline: defaults.colors.surface,
      outlineWidth: defaults.sizes.pointOutlineWidth,
    },
    selectedPoint: {
      pixelSize: 8,
      fill: defaults.colors.transparent,
      outline: defaults.colors.surface,
      outlineWidth: defaults.sizes.pointOutlineWidth,
    },
  },
});
