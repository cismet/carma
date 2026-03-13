import type { CssPixelPosition } from '@carma/units/types';

export type SvgLine = {
  start: CssPixelPosition;
  end: CssPixelPosition;
};

export type SvgLineCapStyle = 'round' | 'square';

export type SvgLineDynamicDashPattern = {
  dashLengthToStrokeWidthRatio: number;
  dashGapToDashLengthRatio: number;
  collapseNegativeGaps?: boolean;
  collapseCapThresholdEffectiveGapRatio?: number;
};

export type SvgLineLabelDominantBaseline =
  | 'middle'
  | 'central'
  | 'text-before-edge'
  | 'text-after-edge'
  | 'alphabetic'
  | 'hanging'
  | 'ideographic'
  | 'auto';

export type SvgLineVisualizerData = {
  id: string;
  getSvgLine?: () => SvgLine | null;
  stroke?: string;
  strokeWidth?: number;
  strokeLinecap?: 'butt' | 'round' | 'square';
  strokeDasharray?: string;
  strokeDashoffset?: number;
  opacity?: number;
  hitTargetStrokeWidth?: number;
  onLineClick?: () => void;
  onLineLongPress?: () => void;
  longPressDurationMs?: number;
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
  labelOffsetPx?: number;
  labelFlippedBaselineOffsetPx?: number;
  labelRotationMode?: 'auto' | 'clockwise';
  labelDominantBaseline?: SvgLineLabelDominantBaseline;
  getLabelOutsideReferencePoint?: () => CssPixelPosition | null;
  getLabelInsideReferencePoint?: () => CssPixelPosition | null;
  visible?: boolean;
  isHidden?: boolean;
  contentSignature?: string;
  onLabelClick?: () => void;
};

const DEFAULT_DASH_LENGTH_TO_STROKE_WIDTH_RATIO = 4;
const DEFAULT_DASH_GAP_TO_DASH_LENGTH_RATIO = 8 / 6;
const DEFAULT_COLLAPSE_CAP_THRESHOLD_EFFECTIVE_GAP_RATIO = -0.1;

type BaseLineVisualizerOptions = Omit<
  SvgLineVisualizerData,
  | 'id'
  | 'getSvgLine'
  | 'strokeLinecap'
  | 'strokeDasharray'
  | 'strokeDashoffset'
  | 'dynamicDashPattern'
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
}): SvgLineDynamicDashPattern | undefined => {
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
): SvgLineVisualizerData['strokeLinecap'] => capStyle ?? 'round';

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
}: CreateSvgLineVisualizerOptions): SvgLineVisualizerData => {
  // Benchmark context:
  // our DOM update benchmarks favored SVG <line> primitives updated through
  // SVGAnimatedLength baseVal writes over both setAttribute updates and <path>
  // d-string updates for high-frequency overlay repositioning.
  return {
    id,
    ...line,
    getSvgLine,
    strokeDasharray: dashed ? '1 1' : 'none',
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
}: CreateScreenPointSvgLineVisualizerOptions): SvgLineVisualizerData => {
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
): SvgLineVisualizerData[] => [
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
}: CreateScreenPointSvgLineVisualizersOptions): SvgLineVisualizerData[] => {
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
