import React, { useCallback, useRef } from "react";

export interface LineVisualizerProps {
  stroke?: string;
  strokeWidth?: number;
  strokeLinecap?: "butt" | "round" | "square";
  strokeDasharray?: string;
  strokeDashoffset?: number;
  opacity?: number;
  hitTargetStrokeWidth?: number;
  onLineClick?: () => void;
  onLineLongPress?: () => void;
  longPressDurationMs?: number;
}

export const LineVisualizer = React.memo(
  ({
    stroke = "rgba(255, 255, 255, 0.9)",
    strokeWidth = 1.5,
    strokeLinecap = "round",
    strokeDasharray = "6 4",
    strokeDashoffset = 0,
    opacity = 1,
    hitTargetStrokeWidth,
    onLineClick,
    onLineLongPress,
    longPressDurationMs = 300,
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
          strokeLinecap={strokeLinecap}
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
          strokeLinecap={strokeLinecap}
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
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
      </svg>
    );
  }
);

LineVisualizer.displayName = "LineVisualizer";
