import {
  runtimeMeasurementVisualDefaults,
  type RuntimePointMarkerVisualStyle,
} from "../../config/measurementVisualDefaults";

export type PointToolVisualSettings = {
  point: RuntimePointMarkerVisualStyle;
  selectedPoint: RuntimePointMarkerVisualStyle;
};

export type PointToolSettings = {
  visuals: PointToolVisualSettings;
};

const defaults = runtimeMeasurementVisualDefaults;
const TRANSPARENT_MARKER_FILL = "rgba(0, 0, 0, 0)";

export const createPointToolSettings = (_badgeStyle: {
  backgroundColor: string;
  textColor: string;
}): PointToolSettings => ({
  visuals: {
    point: {
      pixelSize: defaults.sizes.pointPixelSize,
      fill: TRANSPARENT_MARKER_FILL,
      outline: defaults.colors.surface,
      outlineWidth: defaults.sizes.pointOutlineWidth,
    },
    selectedPoint: {
      pixelSize: defaults.sizes.selectedPointPixelSize,
      fill: TRANSPARENT_MARKER_FILL,
      outline: defaults.colors.surface,
      outlineWidth: defaults.sizes.pointOutlineWidth,
    },
  },
});
