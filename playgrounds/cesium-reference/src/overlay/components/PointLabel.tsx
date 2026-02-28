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
  pitch?: number; //camera pitch in radians
  textColor?: string;
  textBackgroundColor?: string;
  lineWidth?: number;
  lineColor?: string;
  markerStyle?: MarkerStyle;
  markerSize?: number;
  markerStrokeWidth?: number;
  markerColor?: string;
  labelDistance?: number;
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

const defaultPitch = -Math.PI / 4;
// pitch is 0 near horizon -pi/2 in nadir

// Simple offset calculation - labels go to the right and slightly up
// Adjust vertical offset based on camera pitch for better visibility

// Memoized PointLabel component to prevent unnecessary rerenders
export const PointLabel = React.memo(
  ({
    text,
    selected = false,
    fontSize = "12px",
    textColor = "black",
    textBackgroundColor = "rgba(200, 200, 200, 0.7)",
    isOccluded = false,
    pitch = defaultPitch,
    lineColor = "white",
    lineWidth = 1,
    markerStyle = MarkerStyle.CIRCLE,
    markerSize = 10,
    markerStrokeWidth = 1,
    labelDistance = 20,
  }: PointLabelProps) => {
    const labelAngleRad = -Math.abs(Math.cos(pitch));
    const xComponent = Math.cos(labelAngleRad);
    const yComponent = Math.sin(labelAngleRad);
    const labelOffsetX = xComponent * labelDistance;
    const labelOffsetY = yComponent * labelDistance;
    const radius = markerSize / 2;
    const halfLineWidth = lineWidth / 2;

    return (
      <div
        style={{
          position: "relative",
          mixBlendMode: "exclusion",
          opacity: isOccluded ? 0.75 : 1,
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
            border: `${markerStrokeWidth}px ${
              isOccluded ? "dashed" : "solid"
            } ${selected ? "#1890ff" : "#fff"}`,
            borderRadius: "50%",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
          }}
        />

        {/* Transform container for hairline rotation */}
        <div
          style={{
            position: "absolute",
            left: "0px", // Start from center
            top: "0px", // Start from center
            transformOrigin: "0 0",
            transform: `rotate(${labelAngleRad}rad)`,
            pointerEvents: "none",
          }}
        >
          {/* Hairline from circle edge to label */}
          <div
            style={{
              position: "absolute",
              left: `${radius}px`, // Start from circle edge
              top: `${-halfLineWidth}px`, // Center the line vertically
              width: `${labelDistance - radius}px`, // Distance from circle edge to label
              height: `${lineWidth}px`,
              borderBottom: `${lineWidth}px ${
                isOccluded ? "dashed" : "solid"
              } ${lineColor}`,
            }}
          />
        </div>

        {/* Label positioned at the end of the hairline */}
        <div
          style={{
            ...baseStyles,
            borderBottom: `${lineWidth}px ${
              isOccluded ? "dashed" : "solid"
            } ${lineColor}`,
            fontSize,
            backgroundColor: textBackgroundColor,
            color: textColor,
            position: "absolute",
            left: `${labelOffsetX}px`,
            top: `${labelOffsetY + halfLineWidth}px`, // Simplified positioning
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
