import type { LineVisualizerData, SvgLine } from "../lineVisualizers.types";

const MIN_LINE_LENGTH_PX = 0.0001;
const MIN_STROKE_WIDTH_PX = 0.1;
const MAX_DASH_COUNT = 2048;
const MIN_DOT_RAW_DASH_LENGTH_PX = 0.01;
const DASH_MATH_EPSILON_PX = 0.000001;
const NEGATIVE_GAP_COLLAPSE_EPSILON_RATIO = 0.001;

export type SvgLineDasharrayCache = Map<number, string | null>;

type ResolvedDashPatternConfig = {
  dashLengthToStrokeWidthRatio: number;
  dashGapToDashLengthRatio: number;
  shouldApplyNegativeGapCollapse: boolean;
  shouldNormalizeDashLengthForNearZeroGap: boolean;
  collapseThresholdWithEpsilon: number;
};

const resolveDashPatternConfig = (
  dynamicDashPattern: LineVisualizerData["dynamicDashPattern"]
): ResolvedDashPatternConfig | null => {
  if (!dynamicDashPattern) {
    return null;
  }

  const dashLengthToStrokeWidthRatio =
    dynamicDashPattern.dashLengthToStrokeWidthRatio;
  const dashGapToDashLengthRatio = dynamicDashPattern.dashGapToDashLengthRatio;
  if (
    !Number.isFinite(dashLengthToStrokeWidthRatio) ||
    dashLengthToStrokeWidthRatio < 1 ||
    !Number.isFinite(dashGapToDashLengthRatio) ||
    dashGapToDashLengthRatio < -1
  ) {
    return null;
  }

  const collapseNegativeGaps =
    dynamicDashPattern.collapseNegativeGaps !== false;
  const collapseCapThresholdEffectiveGapRatio = Number.isFinite(
    dynamicDashPattern.collapseCapThresholdEffectiveGapRatio
  )
    ? (dynamicDashPattern.collapseCapThresholdEffectiveGapRatio as number)
    : -0.1;

  return {
    dashLengthToStrokeWidthRatio,
    dashGapToDashLengthRatio,
    shouldApplyNegativeGapCollapse:
      collapseNegativeGaps &&
      dashGapToDashLengthRatio < -NEGATIVE_GAP_COLLAPSE_EPSILON_RATIO,
    shouldNormalizeDashLengthForNearZeroGap:
      dashGapToDashLengthRatio <= NEGATIVE_GAP_COLLAPSE_EPSILON_RATIO,
    collapseThresholdWithEpsilon:
      collapseCapThresholdEffectiveGapRatio -
      NEGATIVE_GAP_COLLAPSE_EPSILON_RATIO,
  };
};

const shouldCollapseForEffectiveGap = ({
  shouldApplyNegativeGapCollapse,
  effectiveGapRatio,
  collapseThresholdWithEpsilon,
}: {
  shouldApplyNegativeGapCollapse: boolean;
  effectiveGapRatio: number;
  collapseThresholdWithEpsilon: number;
}): boolean =>
  shouldApplyNegativeGapCollapse &&
  effectiveGapRatio < collapseThresholdWithEpsilon;

export const resolveSvgLineDasharray = ({
  line,
  svgLine,
  dasharrayCache,
}: {
  line: Pick<
    LineVisualizerData,
    "dynamicDashPattern" | "strokeWidth" | "strokeLinecap"
  >;
  svgLine: SvgLine;
  dasharrayCache?: SvgLineDasharrayCache;
}): string | null => {
  const dashConfig = resolveDashPatternConfig(line.dynamicDashPattern);
  if (!dashConfig) {
    return null;
  }

  const {
    dashLengthToStrokeWidthRatio,
    dashGapToDashLengthRatio,
    shouldApplyNegativeGapCollapse,
    shouldNormalizeDashLengthForNearZeroGap,
    collapseThresholdWithEpsilon,
  } = dashConfig;
  if (
    shouldCollapseForEffectiveGap({
      shouldApplyNegativeGapCollapse,
      effectiveGapRatio: dashGapToDashLengthRatio,
      collapseThresholdWithEpsilon,
    })
  ) {
    return "none";
  }

  const lineLengthPx = Math.hypot(
    svgLine.end.x - svgLine.start.x,
    svgLine.end.y - svgLine.start.y
  );
  if (!Number.isFinite(lineLengthPx)) {
    return "none";
  }
  const dasharrayCacheKey = Math.max(0, Math.round(lineLengthPx));
  const cachedDasharray = dasharrayCache?.get(dasharrayCacheKey);
  if (cachedDasharray !== undefined) {
    return cachedDasharray;
  }
  const resolveDasharray = (value: string | null): string | null => {
    dasharrayCache?.set(dasharrayCacheKey, value);
    return value;
  };
  if (lineLengthPx <= MIN_LINE_LENGTH_PX) {
    return resolveDasharray("none");
  }

  const strokeWidthPx = Math.max(
    Number(line.strokeWidth ?? 1.5),
    MIN_STROKE_WIDTH_PX
  );
  const capCompensationPx = line.strokeLinecap === "butt" ? 0 : strokeWidthPx;
  const effectiveDashLengthToStrokeWidthRatio =
    shouldNormalizeDashLengthForNearZeroGap ? 1 : dashLengthToStrokeWidthRatio;
  const targetVisibleDashLengthPx = Math.max(
    strokeWidthPx * effectiveDashLengthToStrokeWidthRatio,
    MIN_LINE_LENGTH_PX
  );
  const targetRawDashLengthPx = targetVisibleDashLengthPx - capCompensationPx;
  const fixedRawDashLengthPx =
    capCompensationPx > 0 && targetRawDashLengthPx <= 0
      ? MIN_DOT_RAW_DASH_LENGTH_PX
      : Math.max(targetRawDashLengthPx, 0);
  const fixedVisibleDashLengthPx = Math.max(
    fixedRawDashLengthPx + capCompensationPx,
    MIN_LINE_LENGTH_PX
  );
  const targetVisibleGapPx =
    fixedVisibleDashLengthPx * dashGapToDashLengthRatio;
  const minVisibleDashFitPx = Math.max(
    targetVisibleDashLengthPx - DASH_MATH_EPSILON_PX,
    MIN_LINE_LENGTH_PX
  );
  if (
    dashGapToDashLengthRatio >= -NEGATIVE_GAP_COLLAPSE_EPSILON_RATIO &&
    lineLengthPx < minVisibleDashFitPx
  ) {
    return resolveDasharray("none");
  }
  const targetEffectiveGapRatio = targetVisibleGapPx / fixedVisibleDashLengthPx;
  if (
    shouldCollapseForEffectiveGap({
      shouldApplyNegativeGapCollapse,
      effectiveGapRatio: targetEffectiveGapRatio,
      collapseThresholdWithEpsilon,
    })
  ) {
    return resolveDasharray("none");
  }
  const targetRawGapPx = Math.max(targetVisibleGapPx + capCompensationPx, 0);
  const maxDashCountByLength =
    fixedRawDashLengthPx <= MIN_LINE_LENGTH_PX
      ? MAX_DASH_COUNT
      : Math.floor(lineLengthPx / fixedRawDashLengthPx);
  const maxDashCount = Math.max(
    1,
    Math.min(maxDashCountByLength, MAX_DASH_COUNT)
  );

  if (
    !Number.isFinite(fixedRawDashLengthPx) ||
    !Number.isFinite(fixedVisibleDashLengthPx) ||
    !Number.isFinite(targetVisibleGapPx) ||
    !Number.isFinite(targetRawGapPx)
  ) {
    return resolveDasharray("none");
  }

  if (maxDashCount < 2) {
    const forcedRawDashLengthPx = Math.max(
      Math.min(lineLengthPx * 0.5, fixedRawDashLengthPx),
      MIN_DOT_RAW_DASH_LENGTH_PX
    );
    if (
      !Number.isFinite(forcedRawDashLengthPx) ||
      forcedRawDashLengthPx <= 0 ||
      forcedRawDashLengthPx * 2 > lineLengthPx + DASH_MATH_EPSILON_PX
    ) {
      return resolveDasharray("none");
    }
    const forcedVisibleGapPx = DASH_MATH_EPSILON_PX - capCompensationPx;
    const forcedEffectiveGapRatio =
      forcedVisibleGapPx / fixedVisibleDashLengthPx;
    if (
      shouldCollapseForEffectiveGap({
        shouldApplyNegativeGapCollapse,
        effectiveGapRatio: forcedEffectiveGapRatio,
        collapseThresholdWithEpsilon,
      })
    ) {
      return resolveDasharray("none");
    }
    return resolveDasharray(`${forcedRawDashLengthPx} ${DASH_MATH_EPSILON_PX}`);
  }

  const idealDashCountReal =
    fixedRawDashLengthPx + targetRawGapPx <= MIN_LINE_LENGTH_PX
      ? maxDashCount
      : (lineLengthPx + targetRawGapPx) /
        (fixedRawDashLengthPx + targetRawGapPx);
  const baseDashCount = Number.isFinite(idealDashCountReal)
    ? Math.max(2, Math.min(maxDashCount, Math.floor(idealDashCountReal)))
    : 2;

  const candidateDashCounts = new Set<number>([
    2,
    maxDashCount,
    baseDashCount - 1,
    baseDashCount,
    baseDashCount + 1,
    Math.ceil(idealDashCountReal),
  ]);

  let best: { dashCount: number; rawGapPx: number; score: number } | null =
    null;

  candidateDashCounts.forEach((dashCount) => {
    const n = Math.max(2, Math.min(maxDashCount, Math.floor(dashCount)));
    const denominator = n - 1;
    if (denominator <= 0) {
      return;
    }

    const rawGapPx = (lineLengthPx - n * fixedRawDashLengthPx) / denominator;
    if (!Number.isFinite(rawGapPx) || rawGapPx < -DASH_MATH_EPSILON_PX) {
      return;
    }

    const clampedRawGapPx = Math.max(rawGapPx, 0);
    const effectiveVisibleGapPx = clampedRawGapPx - capCompensationPx;
    const effectiveGapRatio = effectiveVisibleGapPx / fixedVisibleDashLengthPx;
    if (
      shouldCollapseForEffectiveGap({
        shouldApplyNegativeGapCollapse,
        effectiveGapRatio,
        collapseThresholdWithEpsilon,
      })
    ) {
      return;
    }
    const score = Math.abs(clampedRawGapPx - targetRawGapPx);
    if (!best) {
      best = { dashCount: n, rawGapPx: clampedRawGapPx, score };
      return;
    }

    if (score + DASH_MATH_EPSILON_PX < best.score) {
      best = { dashCount: n, rawGapPx: clampedRawGapPx, score };
      return;
    }

    if (
      Math.abs(score - best.score) <= DASH_MATH_EPSILON_PX &&
      n > best.dashCount
    ) {
      best = { dashCount: n, rawGapPx: clampedRawGapPx, score };
    }
  });

  if (!best) {
    return resolveDasharray("none");
  }

  const resolvedBest = best as {
    dashCount: number;
    rawGapPx: number;
    score: number;
  };
  const resolvedRawGapPx = resolvedBest.rawGapPx + DASH_MATH_EPSILON_PX;
  return resolveDasharray(`${fixedRawDashLengthPx} ${resolvedRawGapPx}`);
};
