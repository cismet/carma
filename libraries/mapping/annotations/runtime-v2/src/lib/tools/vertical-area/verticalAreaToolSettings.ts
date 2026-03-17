import {
  runtimeMeasurementVisualDefaults,
  type RuntimeEdgeVisualStyle,
  type RuntimePointMarkerVisualStyle,
} from "../../config/measurementVisualDefaults";

export type VerticalAreaToolVisualSettings = {
  edge: RuntimeEdgeVisualStyle;
  selectedEdge: RuntimeEdgeVisualStyle;
  previewEdge: RuntimeEdgeVisualStyle;
  point: RuntimePointMarkerVisualStyle;
  selectedPoint: RuntimePointMarkerVisualStyle;
  previewPoint: RuntimePointMarkerVisualStyle;
};

export type VerticalAreaToolSettings = {
  visuals: VerticalAreaToolVisualSettings;
};

const defaults = runtimeMeasurementVisualDefaults;

export const createVerticalAreaToolSettings = (badgeStyle: {
  backgroundColor: string;
  textColor: string;
}): VerticalAreaToolSettings => ({
  visuals: {
    edge: {
      stroke: defaults.colors.accent,
      strokeWidth: defaults.sizes.edgeStrokeWidth,
    },
    selectedEdge: {
      stroke: defaults.colors.neutral,
      strokeWidth: defaults.sizes.selectedEdgeStrokeWidth,
    },
    previewEdge: {
      stroke: defaults.colors.preview,
      strokeWidth: defaults.sizes.edgeStrokeWidth,
      dashed: true,
    },
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
    previewPoint: {
      pixelSize: defaults.sizes.previewPointPixelSize,
      fill: defaults.colors.preview,
      outline: defaults.colors.surface,
      outlineWidth: defaults.sizes.pointOutlineWidth,
    },
  },
});
