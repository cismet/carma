import {
  runtimeMeasurementVisualDefaults,
  type RuntimeEdgeVisualStyle,
  type RuntimePointMarkerVisualStyle,
} from "../../config/measurement-visual-defaults";

export type NodeChainAreaToolVisualSettings = {
  edge: RuntimeEdgeVisualStyle;
  selectedEdge: RuntimeEdgeVisualStyle;
  previewPoint: RuntimePointMarkerVisualStyle;
  point: RuntimePointMarkerVisualStyle;
  selectedPoint: RuntimePointMarkerVisualStyle;
  fill: string;
  selectedFill: string;
};

export type NodeChainAreaToolSettings = {
  visuals: NodeChainAreaToolVisualSettings;
};

const defaults = runtimeMeasurementVisualDefaults;

export const createNodeChainAreaToolSettings = ({
  badgeStyle: _badgeStyle,
  fill,
  selectedFill,
}: {
  badgeStyle: {
    backgroundColor: string;
    textColor: string;
  };
  fill: string;
  selectedFill: string;
}): NodeChainAreaToolSettings => ({
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
    previewPoint: {
      pixelSize: defaults.sizes.previewPointPixelSize,
      fill: defaults.colors.preview,
      outline: defaults.colors.surface,
      outlineWidth: defaults.sizes.pointOutlineWidth,
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
      outline: defaults.colors.surface,
      outlineWidth: defaults.sizes.pointOutlineWidth,
    },
    fill,
    selectedFill,
  },
});
