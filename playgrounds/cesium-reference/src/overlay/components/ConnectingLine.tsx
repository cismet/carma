import React from "react";
import { calculateLineProperties, Point } from "../utils/lineUtils";

export interface ConnectingLineProps {
  startPoint: Point;
  endPoint: Point;
  color?: string;
  width?: number;
  opacity?: number;
  dashed?: boolean;
  startOffset?: number; // Offset from start point along the line
}

/**
 * Reusable component for drawing CSS-based lines between arbitrary points.
 * The line is positioned so that its center passes through both start and end points,
 * not the edges of the line element.
 */
export const ConnectingLine = React.memo(
  ({
    startPoint,
    endPoint,
    color = "white",
    width = 1,
    opacity = 1,
    dashed = false,
    startOffset = 0,
  }: ConnectingLineProps) => {
    // Calculate line properties using utility function
    const { length, angle, midPoint } = calculateLineProperties(
      startPoint,
      endPoint,
      startOffset
    );

    // Don't render if length is too small or invalid
    if (length < 0.1) {
      return null;
    }

    return (
      <div
        style={{
          position: "absolute",
          left: `${midPoint.x}px`,
          top: `${midPoint.y}px`,
          width: `${length}px`,
          height: `${width}px`,
          backgroundColor: dashed ? "transparent" : color,
          opacity,
          transform: `translate(-50%, -50%) rotate(${angle}rad)`,
          transformOrigin: "center center",
          pointerEvents: "none",
          ...(dashed && {
            borderTop: `${width}px dashed ${color}`,
            backgroundColor: "transparent",
          }),
        }}
      />
    );
  }
);

export default ConnectingLine;
