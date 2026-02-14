import React, { useEffect, useMemo } from "react";

import { useLabelOverlay } from "./useLabelOverlay";
import {
  LineVisualizer,
  type LineVisualizerProps,
} from "./components/LineVisualizer";

export type ScreenPoint = { x: number; y: number };

export type LineVisualizerData = LineVisualizerProps & {
  id: string;
  getCanvasLine?: () => {
    start: ScreenPoint;
    end: ScreenPoint;
  } | null;
  labelMinLineLengthPx?: number;
  visible?: boolean;
  isHidden?: boolean;
  contentSignature?: string;
};
const MIN_LINE_LENGTH_PX = 0.0001;
const DEFAULT_MIN_LABEL_LINE_LENGTH_PX = 50;
const LABEL_OFFSET_PX = 10;
const LABEL_MIN_PADDING_PX = 6;
const LINE_OVERLAY_Z_INDEX = 5;

export const useLineVisualizers = (
  lines: LineVisualizerData[],
  showLines: boolean = true
) => {
  const { addLabelOverlayElement, removeLabelOverlayElement } =
    useLabelOverlay();

  const stateSignature = useMemo(
    () =>
      lines
        .map(
          (line) =>
            `${line.id}:${line.visible}:${line.isHidden}:${line.stroke}:${
              line.strokeWidth
            }:${line.strokeDasharray}:${line.opacity}:${line.labelText}:${
              line.labelColor
            }:${line.labelFontSize}:${line.labelFontFamily}:${
              line.labelFontWeight
            }:${line.labelMinLineLengthPx}
            }:${line.contentSignature ?? ""}`
        )
        .join("|"),
    [lines]
  );

  useEffect(() => {
    if (!showLines) {
      lines.forEach((line) => {
        removeLabelOverlayElement(`line-visualizer-${line.id}`);
      });
      return;
    }

    lines.forEach((line) => {
      addLabelOverlayElement({
        id: `line-visualizer-${line.id}`,
        zIndex: LINE_OVERLAY_Z_INDEX,
        content: React.createElement(LineVisualizer, {
          stroke: line.stroke,
          strokeWidth: line.strokeWidth,
          strokeDasharray: line.strokeDasharray,
          opacity: line.opacity,
          hitTargetStrokeWidth: line.hitTargetStrokeWidth,
          labelText: line.labelText,
          labelColor: line.labelColor,
          labelStroke: line.labelStroke,
          labelFontSize: line.labelFontSize,
          labelFontFamily: line.labelFontFamily,
          labelFontWeight: line.labelFontWeight,
          onLineClick: line.onLineClick,
        }),
        visible: line.visible !== false,
        isHidden: line.isHidden,
        updatePosition: (elementDiv) => {
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
              const normalX = -dy / lineLength;
              const normalY = dx / lineLength;
              const textX = midX + normalX * LABEL_OFFSET_PX;
              const textY = midY + normalY * LABEL_OFFSET_PX;
              const rawAngleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
              const angleDeg =
                rawAngleDeg > 90 || rawAngleDeg < -90
                  ? rawAngleDeg + 180
                  : rawAngleDeg;

              textEl.setAttribute("x", `${textX}`);
              textEl.setAttribute("y", `${textY}`);
              textEl.setAttribute(
                "transform",
                `rotate(${angleDeg} ${textX} ${textY})`
              );
              const textLengthPx = textEl.getComputedTextLength();
              const minLabelLineLengthPx =
                line.labelMinLineLengthPx ?? DEFAULT_MIN_LABEL_LINE_LENGTH_PX;
              const shouldShowLabel =
                lineLength >= minLabelLineLengthPx &&
                textLengthPx + LABEL_MIN_PADDING_PX <= lineLength;
              textEl.style.display = shouldShowLabel ? "block" : "none";
            } else {
              textEl.style.display = "none";
            }
          } else if (textEl) {
            textEl.style.display = "none";
          }

          return true;
        },
      });
    });

    return () => {
      lines.forEach((line) => {
        removeLabelOverlayElement(`line-visualizer-${line.id}`);
      });
    };
  }, [
    lines,
    showLines,
    stateSignature,
    addLabelOverlayElement,
    removeLabelOverlayElement,
  ]);
};
