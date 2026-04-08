import {
  runtimeMeasurementVisualDefaults,
  type RuntimePointMarkerVisualStyle,
} from "../../config/measurementVisualDefaults";

export type LabelToolVisualSettings = {
  point: RuntimePointMarkerVisualStyle;
  selectedPoint: RuntimePointMarkerVisualStyle;
};

export type LabelToolSettings = {
  visuals: LabelToolVisualSettings;
};

const defaults = runtimeMeasurementVisualDefaults;
const TRANSPARENT_MARKER_FILL = "rgba(0, 0, 0, 0)";

export const createLabelToolSettings = (_badgeStyle: {
  backgroundColor: string;
  textColor: string;
}): LabelToolSettings => ({
  visuals: {
    point: {
      pixelSize: 6,
      fill: TRANSPARENT_MARKER_FILL,
      outline: defaults.colors.surface,
      outlineWidth: defaults.sizes.pointOutlineWidth,
    },
    selectedPoint: {
      pixelSize: 8,
      fill: TRANSPARENT_MARKER_FILL,
      outline: defaults.colors.surface,
      outlineWidth: defaults.sizes.pointOutlineWidth,
    },
  },
});
