import {
  measurementVisualStyles,
  type EdgeVisualStyle,
  type PointMarkerVisualStyle,
  withEdgeVisualStyle,
  withPointMarkerVisualStyle,
} from "../../config/measurement-visual-defaults";
import { distanceToolVisualDefaults } from "./distance-tool-visual-defaults";

export type DistanceToolVisualSettings = {
  edge: EdgeVisualStyle;
  point: PointMarkerVisualStyle;
};

export type DistanceToolSettings = {
  visuals: DistanceToolVisualSettings;
};

const defaults = measurementVisualStyles;

export const createDistanceToolSettings = (): DistanceToolSettings => ({
  visuals: {
    edge: withEdgeVisualStyle(defaults.edge, {
      strokeWidth: distanceToolVisualDefaults.dashedLine.strokeWidthPx,
      dashed: true,
    }),
    point: withPointMarkerVisualStyle(defaults.point),
  },
});
