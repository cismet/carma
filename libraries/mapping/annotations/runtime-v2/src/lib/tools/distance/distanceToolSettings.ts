import {
  runtimeMeasurementVisualDefaults,
  type RuntimeEdgeVisualStyle,
  type RuntimePointMarkerVisualStyle,
} from "../../config/measurementVisualDefaults";
import { distanceToolVisualDefaults } from "./distanceToolVisualDefaults";

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

export const createDistanceToolSettings = (_badgeStyle: {
  backgroundColor: string;
  textColor: string;
  selectionColor: string;
}): DistanceToolSettings => ({
  visuals: {
    edge: {
      stroke: defaults.colors.accent,
      strokeWidth: distanceToolVisualDefaults.dashedLine.strokeWidthPx,
      dashed: true,
    },
    selectedEdge: {
      stroke: defaults.colors.neutral,
      strokeWidth: distanceToolVisualDefaults.dashedLine.strokeWidthPx,
      dashed: true,
    },
    previewEdge: {
      stroke: defaults.colors.preview,
      strokeWidth: defaults.sizes.edgeStrokeWidth,
    },
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
    previewPoint: {
      pixelSize: defaults.sizes.previewPointPixelSize,
      fill: defaults.colors.preview,
      outline: defaults.colors.surface,
      outlineWidth: defaults.sizes.pointOutlineWidth,
    },
  },
});
