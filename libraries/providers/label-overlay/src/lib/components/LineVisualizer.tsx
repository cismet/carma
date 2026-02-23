import React, { useCallback, useRef } from "react";

export interface LineVisualizerProps {
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  strokeDashoffset?: number;
  opacity?: number;
  hitTargetStrokeWidth?: number;
  labelText?: string;
  labelColor?: string;
  labelStroke?: string;
  labelFontSize?: number;
  labelFontFamily?: string;
  labelFontWeight?: string | number;
  labelDominantBaseline?:
    | "middle"
    | "central"
    | "text-before-edge"
    | "text-after-edge"
    | "alphabetic"
    | "hanging"
    | "ideographic"
    | "auto";
  onLineClick?: () => void;
  onLineLongPress?: () => void;
  longPressDurationMs?: number;
  onLabelClick?: () => void;
}

export const LineVisualizer = React.memo(
  ({
    stroke = "rgba(255, 255, 255, 0.9)",
    strokeWidth = 1.5,
    strokeDasharray = "6 4",
    strokeDashoffset = 0,
    opacity = 1,
    hitTargetStrokeWidth,
    labelText,
    labelColor = "#000000",
    labelStroke = "rgba(255, 255, 255, 0.95)",
    labelFontSize = 12,
    labelFontFamily = "Arial, sans-serif",
    labelFontWeight = "400",
    labelDominantBaseline = "middle",
    onLineClick,
    onLineLongPress,
    longPressDurationMs = 300,
    onLabelClick,
  }: LineVisualizerProps) => {
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
      null
    );
    const longPressTriggeredRef = useRef(false);

    const clearLongPressTimer = useCallback(() => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }, []);

    const startLongPressTimer = useCallback(() => {
      if (!onLineLongPress) return;
      clearLongPressTimer();
      longPressTriggeredRef.current = false;
      longPressTimerRef.current = setTimeout(() => {
        longPressTriggeredRef.current = true;
        onLineLongPress();
      }, longPressDurationMs);
    }, [clearLongPressTimer, longPressDurationMs, onLineLongPress]);

    const handleLineClick = useCallback(() => {
      if (longPressTriggeredRef.current) {
        longPressTriggeredRef.current = false;
        return;
      }
      onLineClick?.();
    }, [onLineClick]);

    const isInteractive =
      typeof onLineClick === "function" ||
      typeof onLineLongPress === "function";
    const isLabelInteractive =
      typeof onLabelClick === "function" || isInteractive;

    return (
      <svg
        width="100%"
        height="100%"
        style={{
          position: "absolute",
          inset: 0,
          overflow: "visible",
          pointerEvents: "none",
        }}
      >
        <line
          data-line-visualizer-hit-target="true"
          x1="0"
          y1="0"
          x2="0"
          y2="0"
          stroke="transparent"
          strokeWidth={
            hitTargetStrokeWidth ?? Math.max(Number(strokeWidth) + 8, 10)
          }
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          style={{
            pointerEvents: isInteractive ? "stroke" : "none",
            cursor: isInteractive ? "pointer" : "default",
          }}
          onClick={handleLineClick}
          onPointerDown={startLongPressTimer}
          onPointerUp={clearLongPressTimer}
          onPointerLeave={clearLongPressTimer}
          onPointerCancel={clearLongPressTimer}
        />
        <line
          data-line-visualizer-segment="true"
          x1="0"
          y1="0"
          x2="0"
          y2="0"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          opacity={opacity}
          vectorEffect="non-scaling-stroke"
          style={{
            pointerEvents: isInteractive ? "stroke" : "none",
            cursor: isInteractive ? "pointer" : "default",
          }}
          onClick={handleLineClick}
          onPointerDown={startLongPressTimer}
          onPointerUp={clearLongPressTimer}
          onPointerLeave={clearLongPressTimer}
          onPointerCancel={clearLongPressTimer}
        />
        <text
          data-line-visualizer-text="true"
          x="0"
          y="0"
          textAnchor="middle"
          dominantBaseline={labelDominantBaseline}
          fill={labelColor}
          stroke={labelStroke}
          strokeWidth={3}
          paintOrder="stroke"
          fontSize={labelFontSize}
          fontFamily={labelFontFamily}
          fontWeight={labelFontWeight}
          style={{
            userSelect: "none",
            pointerEvents: isLabelInteractive ? "auto" : "none",
            cursor: isLabelInteractive ? "pointer" : "default",
          }}
          onClick={onLabelClick ?? handleLineClick}
        >
          {labelText ?? ""}
        </text>
      </svg>
    );
  }
);

LineVisualizer.displayName = "LineVisualizer";
