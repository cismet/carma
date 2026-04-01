import type {
  SvgLine,
  SvgLineDynamicDashPattern,
  SvgLineLabelDominantBaseline,
  SvgLineLabelRotationMode,
} from "@carma-commons/svg";
import type { CssPixelPosition } from "@carma-units";

import type { LineVisualizerProps } from "./components/LineVisualizer";
export type { SvgLine };
export type LineDynamicDashPattern = SvgLineDynamicDashPattern;
export type LineLabelDominantBaseline = SvgLineLabelDominantBaseline;

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
  labelRotationMode?: SvgLineLabelRotationMode;
  labelDominantBaseline?: LineLabelDominantBaseline;
  getLabelOutsideReferencePoint?: () => CssPixelPosition | null;
  getLabelInsideReferencePoint?: () => CssPixelPosition | null;
  visible?: boolean;
  isHidden?: boolean;
  contentSignature?: string;
  onLabelClick?: () => void;
};
