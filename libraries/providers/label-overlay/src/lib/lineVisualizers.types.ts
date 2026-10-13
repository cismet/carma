import type {
  SvgLine,
  SvgLineDynamicDashPattern,
  SvgLineLabelDominantBaseline,
} from "@carma-commons/svg";

import type { LineVisualizerProps } from "./components/LineVisualizer";
import type { LineLabelPlacementOptions } from "./lineLabelPlacement";
export type { SvgLine };

export type LineVisualizerData = LineVisualizerProps &
  LineLabelPlacementOptions & {
    id: string;
    getSvgLine?: () => SvgLine | null;
    dynamicDashPattern?: SvgLineDynamicDashPattern;
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
    labelDominantBaseline?: SvgLineLabelDominantBaseline;
    visible?: boolean;
    isHidden?: boolean;
    contentSignature?: string;
    onLabelClick?: () => void;
  };
