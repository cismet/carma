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

const buildSoftTextShadow = (strokeColor: string): string =>
  [`0 1px 2px rgba(0, 0, 0, 0.68)`, `0 0 10px ${strokeColor}`].join(", ");

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
    pillBackgroundColor = "rgba(200, 200, 200, 0.36)",
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
          style={{
            position: "relative",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: showPill ? "4px 8px" : 0,
            pointerEvents: "none",
          }}
        >
          {showPill ? (
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: "-9px -16px",
                background: `radial-gradient(ellipse at center, ${pillBackgroundColor} 0%, rgba(16, 20, 28, 0.2) 42%, rgba(16, 20, 28, 0.06) 72%, rgba(16, 20, 28, 0) 100%)`,
                backdropFilter: "blur(10px) saturate(1.06) brightness(1.12)",
                WebkitBackdropFilter:
                  "blur(10px) saturate(1.06) brightness(1.12)",
                maskImage:
                  "radial-gradient(ellipse at center, rgba(0, 0, 0, 0.98) 0%, rgba(0, 0, 0, 0.72) 48%, rgba(0, 0, 0, 0.18) 78%, rgba(0, 0, 0, 0) 100%)",
                WebkitMaskImage:
                  "radial-gradient(ellipse at center, rgba(0, 0, 0, 0.98) 0%, rgba(0, 0, 0, 0.72) 48%, rgba(0, 0, 0, 0.18) 78%, rgba(0, 0, 0, 0) 100%)",
                border: "none",
                borderRadius: 999,
                pointerEvents: "none",
              }}
            />
          ) : null}
          <span
            data-anchored-label-text="true"
            onClick={onClick}
            style={{
              position: "relative",
              display: "inline-block",
              whiteSpace: "nowrap",
              color,
              fontSize,
              fontFamily,
              fontWeight,
              textShadow: buildSoftTextShadow(stroke),
              cursor: isInteractive ? "pointer" : "default",
              pointerEvents: isInteractive ? "auto" : "none",
            }}
          >
            {text ?? ""}
          </span>
        </span>
      </div>
    );
  }
);

AnchoredLabelVisualizer.displayName = "AnchoredLabelVisualizer";
