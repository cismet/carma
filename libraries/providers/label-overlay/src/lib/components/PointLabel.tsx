import React, { useState } from "react";

export interface PointLabelStyleProps {
  fontSize?: string;
  fontFamily?: string;
  fontWeight?: string | number;
  textColor?: string;
  textBackgroundColor?: string;
  selectedBackgroundColor?: string;
  hoverBackgroundColor?: string;
  lineWidth?: number;
  lineColor?: string;
  markerSize?: number;
  markerStrokeWidth?: number;
  labelDistance?: number;
}

interface PointLabelProps extends PointLabelStyleProps {
  text: string;
  selected?: boolean;
  isOccluded?: boolean;
  pitch?: number;
  onClick?: () => void;
}

const baseStyles: React.CSSProperties = {
  padding: "2px 4px",
  boxSizing: "border-box",
  whiteSpace: "nowrap",
  userSelect: "none",
  pointerEvents: "none",
  margin: 0,
};

const defaultPitch = -Math.PI / 4;

export const PointLabel = React.memo(
  ({
    text,
    selected = false,
    fontSize = "12px",
    fontFamily = "Arial, sans-serif",
    fontWeight = "400",
    textColor = "black",
    textBackgroundColor = "rgba(200, 200, 200, 0.7)",
    selectedBackgroundColor = "rgba(255, 229, 143, 0.7)",
    hoverBackgroundColor = "rgba(255, 247, 230, 0.7)",
    isOccluded = false,
    pitch = defaultPitch,
    lineColor = "white",
    lineWidth = 1,
    markerSize = 10,
    markerStrokeWidth = 1,
    labelDistance = 20,
    onClick,
  }: PointLabelProps) => {
    const [isHovered, setIsHovered] = useState(false);
    const labelAngleRad = -Math.abs(Math.cos(pitch));
    const xComponent = Math.cos(labelAngleRad);
    const yComponent = Math.sin(labelAngleRad);
    const labelOffsetX = xComponent * labelDistance;
    const labelOffsetY = yComponent * labelDistance;
    const radius = markerSize / 2;
    const halfLineWidth = lineWidth / 2;
    const isInteractive = Boolean(onClick);
    const pointerEvents = isInteractive ? "auto" : "none";
    const cursor = isInteractive ? "pointer" : "default";
    const effectiveLineColor = lineColor;
    const effectiveTextColor = textColor;
    const effectiveBackgroundColor = selected
      ? selectedBackgroundColor
      : isHovered
      ? hoverBackgroundColor
      : textBackgroundColor;
    const handleMouseEnter = () => {
      if (isInteractive) setIsHovered(true);
    };
    const handleMouseLeave = () => {
      if (isInteractive) setIsHovered(false);
    };

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
            } #fff`,
            borderRadius: "50%",
            transform: "translate(-50%, -50%)",
            pointerEvents,
            cursor,
          }}
          onClick={onClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        />

        {/* Transform container for hairline rotation */}
        <div
          style={{
            position: "absolute",
            left: "0px",
            top: "0px",
            transformOrigin: "0 0",
            transform: `rotate(${labelAngleRad}rad)`,
            pointerEvents: "none",
          }}
        >
          {/* Hairline from circle edge to label */}
          <div
            style={{
              position: "absolute",
              left: `${radius}px`,
              top: `${-halfLineWidth}px`,
              width: `${labelDistance - radius}px`,
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
            } ${effectiveLineColor}`,
            fontSize,
            fontFamily,
            fontWeight,
            backgroundColor: effectiveBackgroundColor,
            color: effectiveTextColor,
            position: "absolute",
            left: `${labelOffsetX}px`,
            top: `${labelOffsetY + halfLineWidth}px`,
            transform: "translate(0%, -100%)",
            pointerEvents,
            cursor,
          }}
          onClick={onClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {text}
        </div>
      </div>
    );
  }
);
