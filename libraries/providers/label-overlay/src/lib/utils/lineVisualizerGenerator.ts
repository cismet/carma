import type { CssPixelPosition } from "@carma/units/types";

import type { LineVisualizerData } from "../useLineVisualizers";

type SvgLine = {
  start: CssPixelPosition;
  end: CssPixelPosition;
};

const DEFAULT_DASH_LENGTH_TO_STROKE_WIDTH_RATIO = 4;
const DEFAULT_DASH_GAP_TO_DASH_LENGTH_RATIO = 8 / 6;
const DEFAULT_COLLAPSE_CAP_THRESHOLD_EFFECTIVE_GAP_RATIO = -0.1;
export type SvgLineCapStyle = "round" | "square";

type BaseLineVisualizerOptions = Omit<
  LineVisualizerData,
  | "id"
  | "getSvgLine"
  | "strokeLinecap"
  | "strokeDasharray"
  | "strokeDashoffset"
  | "dynamicDashPattern"
> & {
  id: string;
  dashed?: boolean;
  dashLengthRatio?: number;
  dashGapRatio?: number;
  collapseNegativeGaps?: boolean;
  collapseCapThresholdEffectiveGapRatio?: number;
  capStyle?: SvgLineCapStyle;
};

export type CreateSvgLineVisualizerOptions = BaseLineVisualizerOptions & {
  getSvgLine: () => SvgLine | null;
};

export type CreateScreenPointSvgLineVisualizerOptions =
  BaseLineVisualizerOptions & {
    start: CssPixelPosition;
    end: CssPixelPosition;
    showDistanceLabel?: boolean;
    formatDistanceLabel?: (distancePx: number) => string;
    labelText?: string;
  };

export type CreateSvgLineVisualizersOptions = CreateSvgLineVisualizerOptions;

export type CreateScreenPointSvgLineVisualizersOptions =
  CreateScreenPointSvgLineVisualizerOptions;

const resolveDynamicDashPattern = ({
  dashed,
  dashLengthRatio,
  dashGapRatio,
  collapseNegativeGaps,
  collapseCapThresholdEffectiveGapRatio,
}: {
  dashed: boolean;
  dashLengthRatio?: number;
  dashGapRatio?: number;
  collapseNegativeGaps?: boolean;
  collapseCapThresholdEffectiveGapRatio?: number;
}): LineVisualizerData["dynamicDashPattern"] | undefined => {
  if (!dashed) {
    return undefined;
  }

  const resolvedDashLengthRatio =
    Number.isFinite(dashLengthRatio) && (dashLengthRatio as number) >= 1
      ? (dashLengthRatio as number)
      : DEFAULT_DASH_LENGTH_TO_STROKE_WIDTH_RATIO;
  const resolvedDashGapRatio =
    Number.isFinite(dashGapRatio) && (dashGapRatio as number) >= -1
      ? (dashGapRatio as number)
      : DEFAULT_DASH_GAP_TO_DASH_LENGTH_RATIO;
  const resolvedCollapseCapThresholdEffectiveGapRatio = Number.isFinite(
    collapseCapThresholdEffectiveGapRatio
  )
    ? (collapseCapThresholdEffectiveGapRatio as number)
    : DEFAULT_COLLAPSE_CAP_THRESHOLD_EFFECTIVE_GAP_RATIO;

  return {
    dashLengthToStrokeWidthRatio: resolvedDashLengthRatio,
    dashGapToDashLengthRatio: resolvedDashGapRatio,
    collapseNegativeGaps: collapseNegativeGaps !== false,
    collapseCapThresholdEffectiveGapRatio:
      resolvedCollapseCapThresholdEffectiveGapRatio,
  };
};

const resolveStrokeLinecap = (
  capStyle: SvgLineCapStyle | undefined
): LineVisualizerData["strokeLinecap"] => capStyle ?? "round";

export const getScreenPointDistance = (
  start: CssPixelPosition,
  end: CssPixelPosition
): number => Math.hypot(end.x - start.x, end.y - start.y);

export const createSvgLineVisualizer = ({
  id,
  getSvgLine,
  dashed = false,
  dashLengthRatio,
  dashGapRatio,
  collapseNegativeGaps,
  collapseCapThresholdEffectiveGapRatio,
  capStyle,
  ...line
}: CreateSvgLineVisualizerOptions): LineVisualizerData => {
  return {
    id,
    ...line,
    getSvgLine,
    strokeDasharray: dashed ? "1 1" : "none",
    strokeDashoffset: 0,
    strokeLinecap: resolveStrokeLinecap(capStyle),
    dynamicDashPattern: resolveDynamicDashPattern({
      dashed,
      dashLengthRatio,
      dashGapRatio,
      collapseNegativeGaps,
      collapseCapThresholdEffectiveGapRatio,
    }),
  };
};

export const createScreenPointSvgLineVisualizer = ({
  start,
  end,
  showDistanceLabel = false,
  formatDistanceLabel = (distancePx) => `${distancePx.toFixed(1)} px`,
  labelText,
  ...line
}: CreateScreenPointSvgLineVisualizerOptions): LineVisualizerData => {
  const resolvedLabelText =
    labelText ??
    (showDistanceLabel
      ? formatDistanceLabel(getScreenPointDistance(start, end))
      : undefined);

  return createSvgLineVisualizer({
    ...line,
    labelText: resolvedLabelText,
    getSvgLine: () => ({
      start,
      end,
    }),
  });
};

export const createSvgLineVisualizers = (
  line: CreateSvgLineVisualizersOptions
): LineVisualizerData[] => [
  createSvgLineVisualizer({
    ...line,
  }),
];

export const createScreenPointSvgLineVisualizers = ({
  start,
  end,
  showDistanceLabel = false,
  formatDistanceLabel = (distancePx) => `${distancePx.toFixed(1)} px`,
  labelText,
  ...line
}: CreateScreenPointSvgLineVisualizersOptions): LineVisualizerData[] => {
  const resolvedLabelText =
    labelText ??
    (showDistanceLabel
      ? formatDistanceLabel(getScreenPointDistance(start, end))
      : undefined);

  return createSvgLineVisualizers({
    ...line,
    labelText: resolvedLabelText,
    getSvgLine: () => ({
      start,
      end,
    }),
  });
};
