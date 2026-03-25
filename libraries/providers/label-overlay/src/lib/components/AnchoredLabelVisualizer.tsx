import React from "react";

export interface AnchoredLabelVisualizerProps {
  text?: string;
  anchorX?: number;
  anchorY?: number;
  rotationDeg?: number;
  color?: string;
  stroke?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  pill?: boolean;
  pillBackgroundColor?: string;
  pillBorderColor?: string;
  pillBorderWidth?: number;
  onClick?: () => void;
}

const buildOutlineTextShadow = (strokeColor: string): string =>
  [
    `1px 0 0 ${strokeColor}`,
    `-1px 0 0 ${strokeColor}`,
    `0 1px 0 ${strokeColor}`,
    `0 -1px 0 ${strokeColor}`,
    `1px 1px 0 ${strokeColor}`,
    `-1px 1px 0 ${strokeColor}`,
    `1px -1px 0 ${strokeColor}`,
    `-1px -1px 0 ${strokeColor}`,
  ].join(", ");

export const AnchoredLabelVisualizer = React.memo(
  ({
    text,
    anchorX = 0,
    anchorY = 0,
    rotationDeg = 0,
    color = "#000000",
    stroke = "rgba(255, 255, 255, 0.95)",
    fontSize = 12,
    fontFamily = "Arial, sans-serif",
    fontWeight = "400",
    pill = false,
    pillBackgroundColor = "rgba(200, 200, 200, 0.72)",
    pillBorderColor = "rgba(255, 255, 255, 0.95)",
    pillBorderWidth = 1,
    onClick,
  }: AnchoredLabelVisualizerProps) => {
    const isInteractive = typeof onClick === "function";
    const showPill = Boolean(pill && text);

    return (
      <div
        data-anchored-label-root="true"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transform: `translate(${anchorX}px, ${anchorY}px) translate(-50%, -50%) rotate(${rotationDeg}deg)`,
          transformOrigin: "center center",
          whiteSpace: "nowrap",
          lineHeight: 1,
          userSelect: "none",
          pointerEvents: "none",
        }}
      >
        <span
          data-anchored-label-text="true"
          onClick={onClick}
          style={{
            display: "inline-block",
            whiteSpace: "nowrap",
            color,
            fontSize,
            fontFamily,
            fontWeight,
            textShadow: buildOutlineTextShadow(stroke),
            background: showPill ? pillBackgroundColor : "transparent",
            border: showPill
              ? `${pillBorderWidth}px solid ${pillBorderColor}`
              : "none",
            borderRadius: showPill ? 999 : 0,
            padding: showPill ? "2px 6px" : 0,
            cursor: isInteractive ? "pointer" : "default",
            pointerEvents: isInteractive ? "auto" : "none",
          }}
        >
          {text ?? ""}
        </span>
      </div>
    );
  }
);

AnchoredLabelVisualizer.displayName = "AnchoredLabelVisualizer";
