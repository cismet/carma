import React, { useEffect, useMemo, useRef } from "react";
import type { CssPixelPosition } from "@carma/units/types";

import { useLabelOverlay } from "./useLabelOverlay";
import {
  LineVisualizer,
  type LineVisualizerProps,
} from "./components/LineVisualizer";

export type LineVisualizerData = LineVisualizerProps & {
  id: string;
  getSvgLine?: () => {
    start: CssPixelPosition;
    end: CssPixelPosition;
  } | null;
  dynamicDashPattern?: {
    dashLengthToStrokeWidthRatio: number;
    dashGapToDashLengthRatio: number;
    collapseNegativeGaps?: boolean;
    collapseCapThresholdEffectiveGapRatio?: number;
  };
  labelMinLineLengthPx?: number;
  labelOffsetPx?: number;
  labelFlippedBaselineOffsetPx?: number;
  labelRotationMode?: "auto" | "clockwise";
  getLabelOutsideReferencePoint?: () => CssPixelPosition | null;
  getLabelInsideReferencePoint?: () => CssPixelPosition | null;
  visible?: boolean;
  isHidden?: boolean;
  contentSignature?: string;
};
const MIN_LINE_LENGTH_PX = 0.0001;
const DEFAULT_MIN_LABEL_LINE_LENGTH_PX = 50;
const LABEL_OFFSET_PX = 10;
const LABEL_MIN_PADDING_PX = 6;
const LINE_OVERLAY_Z_INDEX = 5;
const LABEL_SIDE_HYSTERESIS_PX = 1.5;
const LABEL_POSITION_STABILITY_EPSILON_PX = 0.85;
const LABEL_ANGLE_STABILITY_EPSILON_DEG = 0.75;
const LABEL_VISIBILITY_HYSTERESIS_PX = 2;
const MIN_STROKE_WIDTH_PX = 0.1;
const MAX_DASH_COUNT = 2048;
const MIN_DOT_RAW_DASH_LENGTH_PX = 0.01;
const DASH_MATH_EPSILON_PX = 0.000001;
const NEGATIVE_GAP_COLLAPSE_EPSILON_RATIO = 0.001;

const overlayReferenceIdByValue = new WeakMap<object, number>();
let nextOverlayReferenceId = 1;

const getOverlayReferenceSignature = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object" || typeof value === "function") {
    const ref = value as object;
    const existingId = overlayReferenceIdByValue.get(ref);
    if (existingId) {
      return `ref:${existingId}`;
    }

    const nextId = nextOverlayReferenceId++;
    overlayReferenceIdByValue.set(ref, nextId);
    return `ref:${nextId}`;
  }

  return String(value);
};

const resolveLineLabelPlacement = ({
  line,
  svgLine,
  previousShouldFlip,
}: {
  line: LineVisualizerData;
  svgLine: {
    start: CssPixelPosition;
    end: CssPixelPosition;
  };
  previousShouldFlip: boolean;
}) => {
  const dx = svgLine.end.x - svgLine.start.x;
  const dy = svgLine.end.y - svgLine.start.y;
  const lineLength = Math.hypot(dx, dy);
  if (lineLength <= MIN_LINE_LENGTH_PX) {
    return null;
  }

  const midX = (svgLine.start.x + svgLine.end.x) * 0.5;
  const midY = (svgLine.start.y + svgLine.end.y) * 0.5;
  let normalX = -dy / lineLength;
  let normalY = dx / lineLength;
  const outsideRef = line.getLabelOutsideReferencePoint?.();
  const insideRef = line.getLabelInsideReferencePoint?.();
  let shouldFlip = previousShouldFlip;

  if (outsideRef) {
    const refDx = outsideRef.x - midX;
    const refDy = outsideRef.y - midY;
    const dotWithNormal = refDx * normalX + refDy * normalY;
    if (dotWithNormal > LABEL_SIDE_HYSTERESIS_PX) {
      shouldFlip = true;
    } else if (dotWithNormal < -LABEL_SIDE_HYSTERESIS_PX) {
      shouldFlip = false;
    }
  } else if (insideRef) {
    const refDx = insideRef.x - midX;
    const refDy = insideRef.y - midY;
    const dotWithNormal = refDx * normalX + refDy * normalY;
    if (dotWithNormal < -LABEL_SIDE_HYSTERESIS_PX) {
      shouldFlip = true;
    } else if (dotWithNormal > LABEL_SIDE_HYSTERESIS_PX) {
      shouldFlip = false;
    }
  }

  if (shouldFlip) {
    normalX = -normalX;
    normalY = -normalY;
  }

  const rawAngleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const angleDeg =
    line.labelRotationMode === "clockwise"
      ? (rawAngleDeg + 360) % 360
      : (() => {
          const crossProduct =
            (dx / lineLength) * normalY - (dy / lineLength) * normalX;
          const sideAdjustedAngle =
            crossProduct >= 0 ? rawAngleDeg : rawAngleDeg + 180;
          const normalizedAngle = ((sideAdjustedAngle % 360) + 360) % 360;
          return normalizedAngle > 90 && normalizedAngle < 270
            ? (normalizedAngle + 180) % 360
            : normalizedAngle;
        })();

  const labelOffsetPx = line.labelOffsetPx ?? LABEL_OFFSET_PX;
  const flippedBaselineOffsetPx = shouldFlip
    ? line.labelFlippedBaselineOffsetPx ?? 0
    : 0;
  const angleRad = (angleDeg * Math.PI) / 180;
  const baselineOffsetX = -Math.sin(angleRad) * flippedBaselineOffsetPx;
  const baselineOffsetY = Math.cos(angleRad) * flippedBaselineOffsetPx;

  return {
    lineLength,
    shouldFlip,
    angleDeg,
    textX: midX + normalX * labelOffsetPx + baselineOffsetX,
    textY: midY + normalY * labelOffsetPx + baselineOffsetY,
  };
};

const resolveDynamicDasharray = ({
  line,
  svgLine,
}: {
  line: LineVisualizerData;
  svgLine: {
    start: CssPixelPosition;
    end: CssPixelPosition;
  };
}): string | null => {
  const dynamicDashPattern = line.dynamicDashPattern;
  if (!dynamicDashPattern) {
    return null;
  }

  const dashLengthToStrokeWidthRatio =
    dynamicDashPattern.dashLengthToStrokeWidthRatio;
  const dashGapToDashLengthRatio = dynamicDashPattern.dashGapToDashLengthRatio;
  const collapseNegativeGaps =
    dynamicDashPattern.collapseNegativeGaps !== false;
  const collapseCapThresholdEffectiveGapRatio = Number.isFinite(
    dynamicDashPattern.collapseCapThresholdEffectiveGapRatio
  )
    ? (dynamicDashPattern.collapseCapThresholdEffectiveGapRatio as number)
    : -0.1;
  const shouldApplyNegativeGapCollapse =
    collapseNegativeGaps &&
    dashGapToDashLengthRatio < -NEGATIVE_GAP_COLLAPSE_EPSILON_RATIO;
  const shouldNormalizeDashLengthForNearZeroGap =
    dashGapToDashLengthRatio <= NEGATIVE_GAP_COLLAPSE_EPSILON_RATIO;
  const collapseThresholdWithEpsilon =
    collapseCapThresholdEffectiveGapRatio - NEGATIVE_GAP_COLLAPSE_EPSILON_RATIO;
  if (
    !Number.isFinite(dashLengthToStrokeWidthRatio) ||
    dashLengthToStrokeWidthRatio < 1 ||
    !Number.isFinite(dashGapToDashLengthRatio) ||
    dashGapToDashLengthRatio < -1
  ) {
    return null;
  }
  if (
    shouldApplyNegativeGapCollapse &&
    dashGapToDashLengthRatio < collapseThresholdWithEpsilon
  ) {
    return "none";
  }

  const lineLengthPx = Math.hypot(
    svgLine.end.x - svgLine.start.x,
    svgLine.end.y - svgLine.start.y
  );
  if (!Number.isFinite(lineLengthPx) || lineLengthPx <= MIN_LINE_LENGTH_PX) {
    return "none";
  }

  const strokeWidthPx = Math.max(
    Number(line.strokeWidth ?? 1.5),
    MIN_STROKE_WIDTH_PX
  );
  const capCompensationPx = line.strokeLinecap === "butt" ? 0 : strokeWidthPx;
  // Negative gap requests are normalized to dot-size dashes first so
  // overlap behavior is stable and does not depend on larger dash ratios.
  // Near-zero gap requests are also normalized to avoid effective negative gaps.
  const effectiveDashLengthToStrokeWidthRatio =
    shouldNormalizeDashLengthForNearZeroGap ? 1 : dashLengthToStrokeWidthRatio;
  // Dash ratio is defined in visible space, so cap extension is always
  // compensated in the raw stroke-dasharray values.
  const targetVisibleDashLengthPx = Math.max(
    strokeWidthPx * effectiveDashLengthToStrokeWidthRatio,
    MIN_LINE_LENGTH_PX
  );
  const targetRawDashLengthPx = targetVisibleDashLengthPx - capCompensationPx;
  // Keep a tiny non-zero raw dash in dot mode so endpoint dots render
  // reliably on all browsers (zero-length endpoint dashes can be dropped).
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
  // If a non-negative gap line cannot fit one intended visible dash,
  // render it as solid. Gap size does not affect this early fallback.
  const minVisibleDashFitPx = Math.max(
    targetVisibleDashLengthPx - DASH_MATH_EPSILON_PX,
    MIN_LINE_LENGTH_PX
  );
  if (
    dashGapToDashLengthRatio >= -NEGATIVE_GAP_COLLAPSE_EPSILON_RATIO &&
    lineLengthPx < minVisibleDashFitPx
  ) {
    return "none";
  }
  const targetEffectiveGapRatio = targetVisibleGapPx / fixedVisibleDashLengthPx;
  if (
    shouldApplyNegativeGapCollapse &&
    targetEffectiveGapRatio < collapseThresholdWithEpsilon
  ) {
    return "none";
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
    return "none";
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
      return "none";
    }
    const forcedVisibleGapPx = DASH_MATH_EPSILON_PX - capCompensationPx;
    const forcedEffectiveGapRatio =
      forcedVisibleGapPx / fixedVisibleDashLengthPx;
    if (
      shouldApplyNegativeGapCollapse &&
      forcedEffectiveGapRatio < collapseThresholdWithEpsilon
    ) {
      return "none";
    }
    return `${forcedRawDashLengthPx} ${DASH_MATH_EPSILON_PX}`;
  }

  // Simplified nearest-fit relation:
  //   g(n) = (L - n*d) / (n - 1),  n >= 2
  // pick integer n that keeps g >= 0 and minimizes |g(n) - g_target|.
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
      shouldApplyNegativeGapCollapse &&
      effectiveGapRatio < collapseThresholdWithEpsilon
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
    return "none";
  }

  // Endpoint lock: tiny positive bias keeps the end anchor inside a dash
  // (avoid browser edge rounding dropping the terminal point).
  const resolvedRawGapPx = best.rawGapPx + DASH_MATH_EPSILON_PX;
  return `${fixedRawDashLengthPx} ${resolvedRawGapPx}`;
};

const buildLineOverlayUpdatePosition =
  (line: LineVisualizerData) => (elementDiv: HTMLElement) => {
    const svgLine = line.getSvgLine ? line.getSvgLine() : null;
    if (!svgLine) return false;

    const lineEl = elementDiv.querySelector(
      '[data-line-visualizer-segment="true"]'
    ) as SVGLineElement | null;
    if (!lineEl) return false;

    elementDiv.style.position = "absolute";
    elementDiv.style.left = "0";
    elementDiv.style.top = "0";
    elementDiv.style.width = "100%";
    elementDiv.style.height = "100%";
    elementDiv.style.transform = "none";
    // Keep map interaction free except for explicit line/label hit targets.
    elementDiv.style.pointerEvents = "none";
    elementDiv.style.zIndex = `${LINE_OVERLAY_Z_INDEX}`;

    lineEl.setAttribute("x1", `${svgLine.start.x}`);
    lineEl.setAttribute("y1", `${svgLine.start.y}`);
    lineEl.setAttribute("x2", `${svgLine.end.x}`);
    lineEl.setAttribute("y2", `${svgLine.end.y}`);
    const dynamicDasharray = resolveDynamicDasharray({
      line,
      svgLine,
    });
    lineEl.setAttribute(
      "stroke-dasharray",
      dynamicDasharray ?? line.strokeDasharray ?? "none"
    );
    lineEl.setAttribute("stroke-dashoffset", `${line.strokeDashoffset ?? 0}`);

    const lineHitTargetEl = elementDiv.querySelector(
      '[data-line-visualizer-hit-target="true"]'
    ) as SVGLineElement | null;
    if (lineHitTargetEl) {
      lineHitTargetEl.setAttribute("x1", `${svgLine.start.x}`);
      lineHitTargetEl.setAttribute("y1", `${svgLine.start.y}`);
      lineHitTargetEl.setAttribute("x2", `${svgLine.end.x}`);
      lineHitTargetEl.setAttribute("y2", `${svgLine.end.y}`);
    }

    const textEl = elementDiv.querySelector(
      '[data-line-visualizer-text="true"]'
    ) as SVGTextElement | null;
    if (textEl && line.labelText) {
      const placement = resolveLineLabelPlacement({
        line,
        svgLine,
        previousShouldFlip: textEl.dataset.normalFlip === "1",
      });
      if (placement) {
        textEl.dataset.normalFlip = placement.shouldFlip ? "1" : "0";

        const previousTextX = Number.parseFloat(
          textEl.dataset.stableTextX ?? ""
        );
        const previousTextY = Number.parseFloat(
          textEl.dataset.stableTextY ?? ""
        );
        const hasPreviousTextPosition =
          Number.isFinite(previousTextX) && Number.isFinite(previousTextY);
        const stableTextPosition =
          hasPreviousTextPosition &&
          Math.hypot(
            placement.textX - previousTextX,
            placement.textY - previousTextY
          ) <= LABEL_POSITION_STABILITY_EPSILON_PX
            ? { x: previousTextX, y: previousTextY }
            : { x: placement.textX, y: placement.textY };

        const previousAngleDeg = Number.parseFloat(
          textEl.dataset.stableAngleDeg ?? ""
        );
        const hasPreviousAngle = Number.isFinite(previousAngleDeg);
        const normalizedAngleDelta = hasPreviousAngle
          ? Math.abs(
              ((placement.angleDeg - previousAngleDeg + 540) % 360) - 180
            )
          : Number.POSITIVE_INFINITY;
        const stableAngleDeg =
          hasPreviousAngle &&
          normalizedAngleDelta <= LABEL_ANGLE_STABILITY_EPSILON_DEG
            ? previousAngleDeg
            : placement.angleDeg;

        textEl.dataset.stableTextX = `${stableTextPosition.x}`;
        textEl.dataset.stableTextY = `${stableTextPosition.y}`;
        textEl.dataset.stableAngleDeg = `${stableAngleDeg}`;

        textEl.setAttribute("x", `${stableTextPosition.x}`);
        textEl.setAttribute("y", `${stableTextPosition.y}`);
        textEl.setAttribute(
          "transform",
          `rotate(${stableAngleDeg} ${stableTextPosition.x} ${stableTextPosition.y})`
        );
        const textLengthPx = textEl.getComputedTextLength();
        const minLabelLineLengthPx =
          line.labelMinLineLengthPx ?? DEFAULT_MIN_LABEL_LINE_LENGTH_PX;
        const previousVisible = textEl.dataset.labelVisible === "1";
        const lengthThreshold = previousVisible
          ? minLabelLineLengthPx - LABEL_VISIBILITY_HYSTERESIS_PX
          : minLabelLineLengthPx + LABEL_VISIBILITY_HYSTERESIS_PX;
        const fitThreshold = previousVisible
          ? placement.lineLength + LABEL_VISIBILITY_HYSTERESIS_PX
          : placement.lineLength - LABEL_VISIBILITY_HYSTERESIS_PX;
        const shouldShowLabel =
          placement.lineLength >= lengthThreshold &&
          textLengthPx + LABEL_MIN_PADDING_PX <= fitThreshold;
        textEl.dataset.labelVisible = shouldShowLabel ? "1" : "0";
        textEl.style.display = shouldShowLabel ? "block" : "none";
      } else {
        textEl.dataset.labelVisible = "0";
        textEl.style.display = "none";
      }
    } else if (textEl) {
      textEl.dataset.labelVisible = "0";
      textEl.style.display = "none";
    }

    return true;
  };

export const useLineVisualizers = (
  lines: LineVisualizerData[],
  showLines: boolean = true
) => {
  const {
    addLabelOverlayElement,
    removeLabelOverlayElement,
    updateLabelOverlayElement,
  } = useLabelOverlay();
  const previousLineSignatureByIdRef = useRef<Map<string, string>>(new Map());

  const lineSignatureById = useMemo(
    () =>
      new Map(
        lines.map((line) => [
          line.id,
          `${line.id}:${line.visible}:${line.isHidden}:${line.stroke}:${
            line.strokeWidth
          }:${line.strokeLinecap}:${line.strokeDasharray}:${
            line.strokeDashoffset
          }:${line.dynamicDashPattern?.dashLengthToStrokeWidthRatio ?? ""}:${
            line.dynamicDashPattern?.dashGapToDashLengthRatio ?? ""
          }:${line.dynamicDashPattern?.collapseNegativeGaps ?? ""}:${
            line.dynamicDashPattern?.collapseCapThresholdEffectiveGapRatio ?? ""
          }:${line.opacity}:${line.hitTargetStrokeWidth}:${line.labelText}:${
            line.labelColor
          }:${line.labelStroke}:${line.labelFontSize}:${line.labelFontFamily}:${
            line.labelFontWeight
          }:${line.labelMinLineLengthPx}:${line.labelOffsetPx}:${
            line.labelFlippedBaselineOffsetPx ?? ""
          }:${line.labelRotationMode ?? "auto"}:${
            line.labelDominantBaseline ?? "middle"
          }:${line.longPressDurationMs ?? ""}:${getOverlayReferenceSignature(
            line.onLineClick
          )}:${getOverlayReferenceSignature(
            line.onLineLongPress
          )}:${getOverlayReferenceSignature(line.onLabelClick)}:${
            line.contentSignature ?? ""
          }`,
        ])
      ),
    [lines]
  );

  const lineIndexById = useMemo(
    () => new Map(lines.map((line) => [line.id, line])),
    [lines]
  );

  useEffect(() => {
    if (!showLines) {
      previousLineSignatureByIdRef.current.forEach((_, lineId) => {
        removeLabelOverlayElement(`line-visualizer-${lineId}`);
      });
      previousLineSignatureByIdRef.current.clear();
      return;
    }

    const nextSignatureById = new Map<string, string>();
    lineIndexById.forEach((line, lineId) => {
      const nextSignature = lineSignatureById.get(lineId) ?? "";
      nextSignatureById.set(lineId, nextSignature);
      const overlayId = `line-visualizer-${line.id}`;
      const previousSignature =
        previousLineSignatureByIdRef.current.get(lineId) ?? null;

      if (previousSignature === nextSignature) {
        updateLabelOverlayElement(overlayId, {
          visible: line.visible !== false,
          isHidden: line.isHidden,
          updatePosition: buildLineOverlayUpdatePosition(line),
        });
        return;
      }

      addLabelOverlayElement({
        id: overlayId,
        zIndex: LINE_OVERLAY_Z_INDEX,
        contentKey: nextSignature,
        content: React.createElement(LineVisualizer, {
          stroke: line.stroke,
          strokeWidth: line.strokeWidth,
          strokeLinecap: line.strokeLinecap,
          strokeDasharray: line.strokeDasharray,
          strokeDashoffset: line.strokeDashoffset,
          opacity: line.opacity,
          hitTargetStrokeWidth: line.hitTargetStrokeWidth,
          labelText: line.labelText,
          labelColor: line.labelColor,
          labelStroke: line.labelStroke,
          labelFontSize: line.labelFontSize,
          labelFontFamily: line.labelFontFamily,
          labelFontWeight: line.labelFontWeight,
          labelDominantBaseline: line.labelDominantBaseline,
          onLineClick: line.onLineClick,
          onLineLongPress: line.onLineLongPress,
          longPressDurationMs: line.longPressDurationMs,
          onLabelClick: line.onLabelClick,
        }),
        visible: line.visible !== false,
        isHidden: line.isHidden,
        updatePosition: buildLineOverlayUpdatePosition(line),
      });
    });

    previousLineSignatureByIdRef.current.forEach((_, previousLineId) => {
      if (nextSignatureById.has(previousLineId)) return;
      removeLabelOverlayElement(`line-visualizer-${previousLineId}`);
    });
    previousLineSignatureByIdRef.current = nextSignatureById;
  }, [
    showLines,
    lineIndexById,
    lineSignatureById,
    addLabelOverlayElement,
    removeLabelOverlayElement,
    updateLabelOverlayElement,
  ]);

  useEffect(
    () => () => {
      previousLineSignatureByIdRef.current.forEach((_, lineId) => {
        removeLabelOverlayElement(`line-visualizer-${lineId}`);
      });
      previousLineSignatureByIdRef.current.clear();
    },
    [removeLabelOverlayElement]
  );
};
