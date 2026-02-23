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
  labelOffsetPx?: number;
  labelRotationMode?: "auto" | "clockwise";
  getLabelOutsideReferencePoint?: () => ScreenPoint | null;
  getLabelInsideReferencePoint?: () => ScreenPoint | null;
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
            }:${line.strokeDasharray}:${line.strokeDashoffset}:${
              line.opacity
            }:${line.labelText}:${line.labelColor}:${line.labelFontSize}:${
              line.labelFontFamily
            }:${line.labelFontWeight}:${line.labelMinLineLengthPx}:${
              line.labelOffsetPx
            }:${line.labelRotationMode ?? "auto"}:${
              line.labelDominantBaseline ?? "middle"
            }
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
                      // cross product of line direction and final normal:
                      // positive → label is to the right of the line direction → read forward
                      // negative → label is to the left → read backward (flip 180°)
                      const crossProduct =
                        (dx / lineLength) * normalY -
                        (dy / lineLength) * normalX;
                      const sideAdjustedAngle =
                        crossProduct >= 0 ? rawAngleDeg : rawAngleDeg + 180;
                      const normalizedAngle =
                        ((sideAdjustedAngle % 360) + 360) % 360;
                      return normalizedAngle > 90 && normalizedAngle < 270
                        ? (normalizedAngle + 180) % 360
                        : normalizedAngle;
                    })();

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
