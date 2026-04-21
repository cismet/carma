import {
  measurementVisualStyles,
  type EdgeVisualStyle,
  type PointMarkerVisualStyle,
  withEdgeVisualStyle,
  withPointMarkerVisualStyle,
} from "../../config/measurement-visual-defaults";

export type PolylineToolVisualSettings = {
  edge: EdgeVisualStyle;
  point: PointMarkerVisualStyle;
};

export type PolylineToolSettings = {
  visuals: PolylineToolVisualSettings;
};

const defaults = measurementVisualStyles;

export const createPolylineToolSettings = (): PolylineToolSettings => ({
  visuals: {
    edge: withEdgeVisualStyle(defaults.edge),
    point: withPointMarkerVisualStyle(defaults.point),
  },
});
