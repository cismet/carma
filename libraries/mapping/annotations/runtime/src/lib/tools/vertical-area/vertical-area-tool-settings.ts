import {
  measurementVisualStyles,
  type EdgeVisualStyle,
  type PointMarkerVisualStyle,
  withEdgeVisualStyle,
  withPointMarkerVisualStyle,
} from "../../config/measurement-visual-defaults";

export type VerticalAreaToolVisualSettings = {
  edge: EdgeVisualStyle;
  point: PointMarkerVisualStyle;
};

export type VerticalAreaToolSettings = {
  visuals: VerticalAreaToolVisualSettings;
};

const defaults = measurementVisualStyles;

export const createVerticalAreaToolSettings = (): VerticalAreaToolSettings => ({
  visuals: {
    edge: withEdgeVisualStyle(defaults.edge),
    point: withPointMarkerVisualStyle(defaults.point),
  },
});
