import React, { useEffect, useMemo, useRef } from "react";
import type { CssPixelPosition } from "@carma/units/types";

import { useLabelOverlay } from "./useLabelOverlay";
import {
  LineVisualizer,
  type LineVisualizerProps,
} from "./components/LineVisualizer";

export type LineVisualizerData = LineVisualizerProps & {
  id: string;
  getCanvasLine?: () => {
    start: CssPixelPosition;
    end: CssPixelPosition;
  } | null;
  labelMinLineLengthPx?: number;
  labelOffsetPx?: number;
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

const buildLineOverlayUpdatePosition =
  (line: LineVisualizerData) => (elementDiv: HTMLElement) => {
    const canvasLine = line.getCanvasLine ? line.getCanvasLine() : null;
    if (!canvasLine) return false;

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

    lineEl.setAttribute("x1", `${canvasLine.start.x}`);
    lineEl.setAttribute("y1", `${canvasLine.start.y}`);
    lineEl.setAttribute("x2", `${canvasLine.end.x}`);
    lineEl.setAttribute("y2", `${canvasLine.end.y}`);

    const lineHitTargetEl = elementDiv.querySelector(
      '[data-line-visualizer-hit-target="true"]'
    ) as SVGLineElement | null;
    if (lineHitTargetEl) {
      lineHitTargetEl.setAttribute("x1", `${canvasLine.start.x}`);
      lineHitTargetEl.setAttribute("y1", `${canvasLine.start.y}`);
      lineHitTargetEl.setAttribute("x2", `${canvasLine.end.x}`);
      lineHitTargetEl.setAttribute("y2", `${canvasLine.end.y}`);
    }

    const textEl = elementDiv.querySelector(
      '[data-line-visualizer-text="true"]'
    ) as SVGTextElement | null;
    if (textEl && line.labelText) {
      const dx = canvasLine.end.x - canvasLine.start.x;
      const dy = canvasLine.end.y - canvasLine.start.y;
      const lineLength = Math.hypot(dx, dy);
      if (lineLength > MIN_LINE_LENGTH_PX) {
        const midX = (canvasLine.start.x + canvasLine.end.x) * 0.5;
        const midY = (canvasLine.start.y + canvasLine.end.y) * 0.5;
        let normalX = -dy / lineLength;
        let normalY = dx / lineLength;
        const outsideRef = line.getLabelOutsideReferencePoint?.();
        const insideRef = line.getLabelInsideReferencePoint?.();
        const previousShouldFlip = textEl.dataset.normalFlip === "1";
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
        textEl.dataset.normalFlip = shouldFlip ? "1" : "0";
        const rawAngleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
        const labelOffsetPx = line.labelOffsetPx ?? LABEL_OFFSET_PX;
        const textX = midX + normalX * labelOffsetPx;
        const textY = midY + normalY * labelOffsetPx;
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
          Math.hypot(textX - previousTextX, textY - previousTextY) <=
            LABEL_POSITION_STABILITY_EPSILON_PX
            ? { x: previousTextX, y: previousTextY }
            : { x: textX, y: textY };

        const previousAngleDeg = Number.parseFloat(
          textEl.dataset.stableAngleDeg ?? ""
        );
        const hasPreviousAngle = Number.isFinite(previousAngleDeg);
        const normalizedAngleDelta = hasPreviousAngle
          ? Math.abs(((angleDeg - previousAngleDeg + 540) % 360) - 180)
          : Number.POSITIVE_INFINITY;
        const stableAngleDeg =
          hasPreviousAngle &&
          normalizedAngleDelta <= LABEL_ANGLE_STABILITY_EPSILON_DEG
            ? previousAngleDeg
            : angleDeg;

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
          ? lineLength + LABEL_VISIBILITY_HYSTERESIS_PX
          : lineLength - LABEL_VISIBILITY_HYSTERESIS_PX;
        const shouldShowLabel =
          lineLength >= lengthThreshold &&
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
          }:${line.strokeDasharray}:${line.strokeDashoffset}:${line.opacity}:${
            line.hitTargetStrokeWidth
          }:${line.labelText}:${line.labelColor}:${line.labelStroke}:${
            line.labelFontSize
          }:${line.labelFontFamily}:${line.labelFontWeight}:${
            line.labelMinLineLengthPx
          }:${line.labelOffsetPx}:${line.labelRotationMode ?? "auto"}:${
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
