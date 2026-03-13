import type { CssPixelPosition } from "@carma/units/types";

import type { LineVisualizerProps } from "./components/LineVisualizer";

export type SvgLine = {
  start: CssPixelPosition;
  end: CssPixelPosition;
};

export type LineDynamicDashPattern = {
  dashLengthToStrokeWidthRatio: number;
  dashGapToDashLengthRatio: number;
  collapseNegativeGaps?: boolean;
  collapseCapThresholdEffectiveGapRatio?: number;
};

export type LineLabelDominantBaseline =
  | "middle"
  | "central"
  | "text-before-edge"
  | "text-after-edge"
  | "alphabetic"
  | "hanging"
  | "ideographic"
  | "auto";

export type LineVisualizerData = LineVisualizerProps & {
  id: string;
  getSvgLine?: () => SvgLine | null;
  dynamicDashPattern?: LineDynamicDashPattern;
  labelText?: string;
  labelColor?: string;
  labelStroke?: string;
  labelFontSize?: number;
  labelFontFamily?: string;
  labelFontWeight?: string | number;
  labelPill?: boolean;
  labelPillBackgroundColor?: string;
  labelPillBorderColor?: string;
  labelPillBorderWidth?: number;
  labelMinLineLengthPx?: number;
  labelOffsetPx?: number;
  labelFlippedBaselineOffsetPx?: number;
  labelRotationMode?: "auto" | "clockwise";
  labelDominantBaseline?: LineLabelDominantBaseline;
  getLabelOutsideReferencePoint?: () => CssPixelPosition | null;
  getLabelInsideReferencePoint?: () => CssPixelPosition | null;
  visible?: boolean;
  isHidden?: boolean;
  contentSignature?: string;
  onLabelClick?: () => void;
};
