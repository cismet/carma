import React from "react";

enum MarkerStyle {
  CROSS,
  CIRCLE,
}

interface PointLabelProps {
  text: string;
  selected?: boolean;
  fontSize?: string;
  isOccluded?: boolean;
  getCameraPitch?: () => number; // Callback to get camera pitch in radians
  textColor?: string;
  textBackgroundColor?: string;
  lineWidth?: number;
  lineColor?: string;
  markerStyle?: MarkerStyle;
  markerSize?: number;
  markerStrokeWidth?: number;
  markerColor?: string;
}

// Stable style objects created outside render to prevent recalculation
const baseStyles: React.CSSProperties = {
  padding: "2px 4px",
  boxSizing: "border-box",
  fontFamily: "Arial, sans-serif",
  fontWeight: "400",
  whiteSpace: "nowrap",
  userSelect: "none",
  pointerEvents: "none",
  margin: 0,
};

// Memoized PointLabel component to prevent unnecessary rerenders
export const PointLabel = React.memo(
  ({
    text,
    selected = false,
    fontSize = "12px",
    textColor = "black",
    textBackgroundColor = "rgba(200, 200, 200, 0.7)",
    isOccluded = false,
    getCameraPitch,
    lineColor = "white",
    lineWidth = 1,
    markerStyle = MarkerStyle.CIRCLE,
    markerSize = 16,
    markerStrokeWidth = 0.5,
  }: PointLabelProps) => {
    // Calculate label offset based on camera pitch
    const pitch = getCameraPitch ? getCameraPitch() : 0;

    // pitch is 0 near horizon -pi/2 in nadir

    // Simple offset calculation - labels go to the right and slightly up
    // Adjust vertical offset based on camera pitch for better visibility
    const labelOffset = {
      x: 20, // Always to the right
      y: -20 * Math.abs(Math.cos(pitch)), // More upward offset when not in nadir
    };

    return (
      <div
        style={{
          position: "relative",
          mixBlendMode: "exclusion",
          opacity: isOccluded ? 0.5 : 1,
        }}
      >
        {/* Measurement dot at anchor position */}
        <div
          style={{
            position: "absolute",
            left: "0px",
            top: "0px",
            width: `${markerSize}px`,
            height: `${markerSize}px`,
            border: `${markerStrokeWidth}px solid ${
              selected ? "#1890ff" : "#fff"
            }`,
            borderRadius: "50%",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
          }}
        />

        {/* Hairline from anchor to label bottom left anchor */}
        <div
          style={{
            position: "absolute",
            left: "0px",
            top: `${-lineWidth / 2}px`,
            width: Math.sqrt(
              labelOffset.x * labelOffset.x + labelOffset.y * labelOffset.y
            ),
            height: `${lineWidth}px`,
            backgroundColor: lineColor,
            transformOrigin: "0 0",
            transform: `rotate(${Math.atan2(labelOffset.y, labelOffset.x)}rad)`,
            pointerEvents: "none",
          }}
        />

        {/* Label positioned at the end of the hairline */}
        <div
          style={{
            ...baseStyles,
            borderBottom: `${lineWidth}px solid ${lineColor}`,
            fontSize,
            backgroundColor: textBackgroundColor,
            color: textColor,
            position: "absolute",
            left: `${labelOffset.x}px`,
            top: `${labelOffset.y + lineWidth / 2}px`, // Adjust by half line width to align with hairline center
            transform: "translate(0%, -100%)", // Position so bottom-left corner is at the hairline end
          }}
        >
          {text}
        </div>
      </div>
    );
  }
);

export default PointLabel;
