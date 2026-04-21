import {
  measurementVisualStyles,
  type PointMarkerVisualStyle,
  withPointMarkerVisualStyle,
} from "../../config/measurement-visual-defaults";

export type PointToolVisualSettings = {
  point: PointMarkerVisualStyle;
};

export type PointToolSettings = {
  visuals: PointToolVisualSettings;
};

const defaults = measurementVisualStyles;

export const createPointToolSettings = (): PointToolSettings => ({
  visuals: {
    point: withPointMarkerVisualStyle(defaults.point),
  },
});
