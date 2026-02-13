import React from "react";

export interface LineVisualizerProps {
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  opacity?: number;
  labelText?: string;
  labelColor?: string;
  labelStroke?: string;
  labelFontSize?: number;
  labelFontFamily?: string;
  labelFontWeight?: string | number;
}

export const LineVisualizer = React.memo(
  ({
    stroke = "rgba(255, 255, 255, 0.9)",
    strokeWidth = 1.5,
    strokeDasharray = "6 4",
    opacity = 1,
    labelText,
    labelColor = "#000000",
    labelStroke = "rgba(255, 255, 255, 0.95)",
    labelFontSize = 12,
    labelFontFamily = "Arial, sans-serif",
    labelFontWeight = "400",
  }: LineVisualizerProps) => {
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
          data-line-visualizer-segment="true"
          x1="0"
          y1="0"
          x2="0"
          y2="0"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
          strokeLinecap="round"
          opacity={opacity}
          vectorEffect="non-scaling-stroke"
        />
        <text
          data-line-visualizer-text="true"
          x="0"
          y="0"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={labelColor}
          stroke={labelStroke}
          strokeWidth={3}
          paintOrder="stroke"
          fontSize={labelFontSize}
          fontFamily={labelFontFamily}
          fontWeight={labelFontWeight}
          style={{ userSelect: "none", pointerEvents: "none" }}
        >
          {labelText ?? ""}
        </text>
      </svg>
    );
  }
);

LineVisualizer.displayName = "LineVisualizer";
