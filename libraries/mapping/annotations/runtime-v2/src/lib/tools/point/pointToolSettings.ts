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

export const createPointToolSettings = (badgeStyle: {
  backgroundColor: string;
  textColor: string;
}): PointToolSettings => ({
  visuals: {
    point: {
      pixelSize: defaults.sizes.pointPixelSize,
      fill: badgeStyle.backgroundColor,
      outline: defaults.colors.surface,
      outlineWidth: defaults.sizes.pointOutlineWidth,
    },
    selectedPoint: {
      pixelSize: defaults.sizes.selectedPointPixelSize,
      fill: badgeStyle.backgroundColor,
      outline: defaults.colors.surface,
      outlineWidth: defaults.sizes.pointOutlineWidth,
    },
  },
});
