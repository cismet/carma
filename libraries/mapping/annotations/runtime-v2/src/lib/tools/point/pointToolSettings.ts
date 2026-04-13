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

export const createPointToolSettings = (_badgeStyle: {
  backgroundColor: string;
  textColor: string;
  selectionColor: string;
}): PointToolSettings => ({
  visuals: {
    point: {
      pixelSize: defaults.sizes.pointPixelSize,
      fill: defaults.colors.transparent,
      outline: defaults.colors.surface,
      outlineWidth: defaults.sizes.pointOutlineWidth,
    },
    selectedPoint: {
      pixelSize: defaults.sizes.selectedPointPixelSize,
      fill: defaults.colors.transparent,
      outline: _badgeStyle.selectionColor,
      outlineWidth: defaults.sizes.pointOutlineWidth,
    },
  },
});
