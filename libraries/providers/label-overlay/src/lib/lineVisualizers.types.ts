import type {
  SvgLine,
  SvgLineDynamicDashPattern,
  SvgLineLabelDominantBaseline,
  SvgLineLabelRotationMode,
} from "@carma-commons/svg";

import type { LineVisualizerProps } from "./components/LineVisualizer";
import type { LineLabelPlacementOptions } from "./lineLabelPlacement";
export type { SvgLine };
export type LineDynamicDashPattern = SvgLineDynamicDashPattern;
export type LineLabelDominantBaseline = SvgLineLabelDominantBaseline;

export type LineVisualizerData = LineVisualizerProps &
  LineLabelPlacementOptions & {
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
    labelDominantBaseline?: LineLabelDominantBaseline;
    visible?: boolean;
    isHidden?: boolean;
    contentSignature?: string;
    onLabelClick?: () => void;
  };
