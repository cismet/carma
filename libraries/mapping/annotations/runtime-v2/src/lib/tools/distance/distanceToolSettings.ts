import {
  runtimeMeasurementVisualDefaults,
  type RuntimeEdgeVisualStyle,
  type RuntimePointMarkerVisualStyle,
} from "../../config/measurementVisualDefaults";

export type DistanceToolVisualSettings = {
  edge: RuntimeEdgeVisualStyle;
  selectedEdge: RuntimeEdgeVisualStyle;
  previewEdge: RuntimeEdgeVisualStyle;
  point: RuntimePointMarkerVisualStyle;
  selectedPoint: RuntimePointMarkerVisualStyle;
  previewPoint: RuntimePointMarkerVisualStyle;
};

export type DistanceToolSettings = {
  visuals: DistanceToolVisualSettings;
};

const defaults = runtimeMeasurementVisualDefaults;
const TRANSPARENT_MARKER_FILL = "rgba(0, 0, 0, 0)";

export const createDistanceToolSettings = (_badgeStyle: {
  backgroundColor: string;
  textColor: string;
}): DistanceToolSettings => ({
  visuals: {
    edge: {
      stroke: defaults.colors.accent,
      strokeWidth: defaults.sizes.edgeStrokeWidth,
      dashed: true,
    },
    selectedEdge: {
      stroke: defaults.colors.neutral,
      strokeWidth: defaults.sizes.selectedEdgeStrokeWidth,
      dashed: true,
    },
    previewEdge: {
      stroke: defaults.colors.preview,
      strokeWidth: defaults.sizes.edgeStrokeWidth,
    },
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
    previewPoint: {
      pixelSize: defaults.sizes.previewPointPixelSize,
      fill: defaults.colors.preview,
      outline: defaults.colors.surface,
      outlineWidth: defaults.sizes.pointOutlineWidth,
    },
  },
});
